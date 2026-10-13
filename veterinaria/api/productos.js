const { getPool, sql } = require('./_db');
const { verifyToken, extractToken } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = extractToken(req);
  const user = verifyToken(token);
  if (!user || user.sistema !== 'VETERINARIA') {
    return res.status(401).json({ ok: false, error: 'Acceso no autorizado' });
  }

  try {
    const pool = await getPool();

    // GET: Listar o buscar productos y combos
    if (req.method === 'GET') {
      // Si piden categorias y unidades para los selects
      if (req.query.catalogos === '1') {
        const catRes = await pool.request().query(`SELECT IDCATEGORIA, NOMCATEGORIA FROM vet.CATEGORIA ORDER BY NOMCATEGORIA`);
        const umRes = await pool.request().query(`SELECT IDUNIDAD_MEDIDA, NOMUNIDAD_MEDIDA FROM vet.UNIDAD_MEDIDA ORDER BY NOMUNIDAD_MEDIDA`);
        return res.status(200).json({
          ok: true,
          categorias: catRes.recordset,
          unidades: umRes.recordset
        });
      }

      const q = req.query.q ? req.query.q.trim() : '';
      let query = `
        SELECT TOP 100
          p.IDPRODUCTO,
          p.NOMPRODUCTO,
          p.DESCRIPCION,
          p.PRECIO_UNITARIO,
          p.STOCK_ACTUAL,
          p.IDCATEGORIA,
          c.NOMCATEGORIA,
          p.IDUNIDAD_MEDIDA,
          u.NOMUNIDAD_MEDIDA,
          p.ESTADO
        FROM vet.PRODUCTO p
        LEFT JOIN vet.CATEGORIA c ON c.IDCATEGORIA = p.IDCATEGORIA
        LEFT JOIN vet.UNIDAD_MEDIDA u ON u.IDUNIDAD_MEDIDA = p.IDUNIDAD_MEDIDA
      `;

      if (q) {
        query += ` WHERE (p.NOMPRODUCTO LIKE @q OR p.DESCRIPCION LIKE @q OR c.NOMCATEGORIA LIKE @q) `;
      }

      query += ` ORDER BY p.IDPRODUCTO DESC`;

      const request = pool.request();
      if (q) request.input('q', sql.VarChar(100), `%${q}%`);

      const result = await request.query(query);
      return res.status(200).json({ ok: true, data: result.recordset });
    }

    // POST: Crear producto
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { nomproducto, descripcion, precio_unitario, stock_actual, idcategoria, idunidad_medida } = body;

      if (!nomproducto || precio_unitario === undefined) {
        return res.status(400).json({ ok: false, error: 'Nombre de producto y precio son obligatorios' });
      }

      const request = pool.request()
        .input('nomproducto', sql.VarChar(100), nomproducto.trim().slice(0, 100))
        .input('descripcion', sql.NVarChar(250), (descripcion || '').trim().slice(0, 250))
        .input('precio', sql.Decimal(6, 2), parseFloat(precio_unitario))
        .input('stock', sql.Int, stock_actual ? parseInt(stock_actual, 10) : 0)
        .input('idcat', sql.Int, idcategoria ? parseInt(idcategoria, 10) : 1)
        .input('idum', sql.Int, idunidad_medida ? parseInt(idunidad_medida, 10) : 1)
        .input('usucre', sql.VarChar(30), user.usuario);

      const insertResult = await request.query(`
        INSERT INTO vet.PRODUCTO
          (NOMPRODUCTO, DESCRIPCION, PRECIO_UNITARIO, STOCK_ACTUAL, IDCATEGORIA, IDUNIDAD_MEDIDA, USUCRE, FECCRE, ESTADO)
        OUTPUT INSERTED.IDPRODUCTO
        VALUES
          (@nomproducto, @descripcion, @precio, @stock, @idcat, @idum, @usucre, SYSDATETIME(), '1');
      `);

      return res.status(201).json({
        ok: true,
        message: 'Producto registrado (Replicado a consolidado.PRODUCTO_CONSOLIDADO vía Trigger)',
        id: insertResult.recordset[0].IDPRODUCTO
      });
    }

    // PUT: Actualizar producto
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const id = parseInt(req.query.id || body.idproducto, 10);
      if (!id) return res.status(400).json({ ok: false, error: 'ID de producto requerido' });

      const { nomproducto, descripcion, precio_unitario, stock_actual, idcategoria, idunidad_medida, estado } = body;

      await pool.request()
        .input('id', sql.Int, id)
        .input('nomproducto', sql.VarChar(100), nomproducto.trim().slice(0, 100))
        .input('descripcion', sql.NVarChar(250), (descripcion || '').trim().slice(0, 250))
        .input('precio', sql.Decimal(6, 2), parseFloat(precio_unitario))
        .input('stock', sql.Int, stock_actual ? parseInt(stock_actual, 10) : 0)
        .input('idcat', sql.Int, idcategoria ? parseInt(idcategoria, 10) : 1)
        .input('idum', sql.Int, idunidad_medida ? parseInt(idunidad_medida, 10) : 1)
        .input('estado', sql.Char(1), (estado || '1').slice(0, 1))
        .input('usumod', sql.VarChar(30), user.usuario)
        .query(`
          UPDATE vet.PRODUCTO
          SET
            NOMPRODUCTO = @nomproducto,
            DESCRIPCION = @descripcion,
            PRECIO_UNITARIO = @precio,
            STOCK_ACTUAL = @stock,
            IDCATEGORIA = @idcat,
            IDUNIDAD_MEDIDA = @idum,
            ESTADO = @estado,
            USUMOD = @usumod,
            FECMOD = SYSDATETIME()
          WHERE IDPRODUCTO = @id
        `);

      return res.status(200).json({ ok: true, message: 'Producto actualizado con éxito' });
    }

    // DELETE: Desactivar producto
    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id, 10);
      if (!id) return res.status(400).json({ ok: false, error: 'ID requerido' });

      await pool.request()
        .input('id', sql.Int, id)
        .input('usumod', sql.VarChar(30), user.usuario)
        .query(`
          UPDATE vet.PRODUCTO
          SET ESTADO = '0', USUMOD = @usumod, FECMOD = SYSDATETIME()
          WHERE IDPRODUCTO = @id
        `);

      return res.status(200).json({ ok: true, message: 'Producto desactivado' });
    }

    return res.status(405).json({ ok: false, error: 'Método no soportado' });
  } catch (err) {
    console.error('Error en API productos:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
