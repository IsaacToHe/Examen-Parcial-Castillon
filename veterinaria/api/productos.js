const { isSupabase, supabaseFetch, toUpperKeys, getPool, sql } = require('./_db');
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
    // GET: Listar o buscar productos y combos
    if (req.method === 'GET') {
      if (req.query.catalogos === '1') {
        if (isSupabase()) {
          const cats = await supabaseFetch('vet_categoria?select=idcategoria,nomcategoria&order=nomcategoria.asc');
          const ums = await supabaseFetch('vet_unidad_medida?select=idunidad_medida,nomunidad_medida&order=nomunidad_medida.asc');
          return res.status(200).json({
            ok: true,
            categorias: (cats || []).map(toUpperKeys),
            unidades: (ums || []).map(toUpperKeys)
          });
        }
        const pool = await getPool();
        const catRes = await pool.request().query(`SELECT IDCATEGORIA, NOMCATEGORIA FROM vet.CATEGORIA ORDER BY NOMCATEGORIA`);
        const umRes = await pool.request().query(`SELECT IDUNIDAD_MEDIDA, NOMUNIDAD_MEDIDA FROM vet.UNIDAD_MEDIDA ORDER BY NOMUNIDAD_MEDIDA`);
        return res.status(200).json({
          ok: true,
          categorias: catRes.recordset,
          unidades: umRes.recordset
        });
      }

      const q = req.query.q ? req.query.q.trim() : '';

      if (isSupabase()) {
        let endpoint = 'vet_producto?select=idproducto,nomproducto,descripcion,precio_unitario,stock_actual,idcategoria,idunidad_medida,estado,vet_categoria(nomcategoria),vet_unidad_medida(nomunidad_medida)&order=idproducto.desc&limit=100';
        if (q) {
          endpoint += `&or=(nomproducto.ilike.*${encodeURIComponent(q)}*,descripcion.ilike.*${encodeURIComponent(q)}*)`;
        }
        const data = await supabaseFetch(endpoint);
        const mapped = (data || []).map(p => {
          const upper = toUpperKeys(p);
          upper.NOMCATEGORIA = p.vet_categoria?.nomcategoria || '';
          upper.NOMUNIDAD_MEDIDA = p.vet_unidad_medida?.nomunidad_medida || '';
          return upper;
        });
        return res.status(200).json({ ok: true, data: mapped });
      }

      const pool = await getPool();
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

      if (isSupabase()) {
        const payload = {
          nomproducto: nomproducto.trim().slice(0, 100),
          descripcion: (descripcion || '').trim().slice(0, 250),
          precio_unitario: parseFloat(precio_unitario) || 0,
          stock_actual: parseFloat(stock_actual) || 0,
          idcategoria: idcategoria ? parseInt(idcategoria, 10) : 1,
          idunidad_medida: idunidad_medida ? parseInt(idunidad_medida, 10) : 1,
          usucre: user.usuario,
          estado: '1'
        };
        const created = await supabaseFetch('vet_producto', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(payload)
        });
        const newId = Array.isArray(created) ? created[0].idproducto : created?.idproducto;
        return res.status(201).json({
          ok: true,
          message: 'Producto registrado (Replicado a consolidado.PRODUCTO_CONSOLIDADO vía Trigger)',
          id: newId
        });
      }

      const pool = await getPool();
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

      if (isSupabase()) {
        const payload = {
          nomproducto: (nomproducto || '').trim().slice(0, 100),
          descripcion: (descripcion || '').trim().slice(0, 250),
          precio_unitario: parseFloat(precio_unitario) || 0,
          stock_actual: parseFloat(stock_actual) || 0,
          idcategoria: idcategoria ? parseInt(idcategoria, 10) : 1,
          idunidad_medida: idunidad_medida ? parseInt(idunidad_medida, 10) : 1,
          estado: (estado || '1').slice(0, 1),
          usumod: user.usuario,
          fecmod: new Date().toISOString()
        };
        await supabaseFetch(`vet_producto?idproducto=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        return res.status(200).json({ ok: true, message: 'Producto actualizado con éxito' });
      }

      const pool = await getPool();
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

      if (isSupabase()) {
        await supabaseFetch(`vet_producto?idproducto=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ estado: '0', usumod: user.usuario, fecmod: new Date().toISOString() })
        });
        return res.status(200).json({ ok: true, message: 'Producto desactivado' });
      }

      const pool = await getPool();
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
