const { isSupabase, supabaseFetch, toUpperKeys, getPool, sql } = require('./_db');
const { verifyToken, extractToken } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = extractToken(req);
  const user = verifyToken(token);
  if (!user || user.sistema !== 'SAMAR') {
    return res.status(401).json({ ok: false, error: 'Acceso no autorizado' });
  }

  try {
    // GET: Listar o buscar articulos
    if (req.method === 'GET') {
      const q = req.query.q ? req.query.q.trim() : '';

      if (isSupabase()) {
        let endpoint = 'samar_articulos?select=*&order=codigo_producto.desc&limit=100';
        if (q) {
          endpoint += `&or=(codigo_producto.ilike.*${encodeURIComponent(q)}*,nombre.ilike.*${encodeURIComponent(q)}*,categoria.ilike.*${encodeURIComponent(q)}*)`;
        }
        const data = await supabaseFetch(endpoint);
        return res.status(200).json({ ok: true, data: (data || []).map(toUpperKeys) });
      }

      const pool = await getPool();
      let query = `
        SELECT TOP 100
          CODIGO_PRODUCTO,
          NOMBRE,
          CATEGORIA,
          PRECIO_UNITARIO,
          COSTO_UNITARIO
        FROM samar.ARTICULOS
      `;

      if (q) {
        query += ` WHERE (CODIGO_PRODUCTO LIKE @q OR NOMBRE LIKE @q OR CATEGORIA LIKE @q) `;
      }

      query += ` ORDER BY CODIGO_PRODUCTO DESC`;

      const request = pool.request();
      if (q) request.input('q', sql.NVarChar(100), `%${q}%`);

      const result = await request.query(query);
      return res.status(200).json({ ok: true, data: result.recordset });
    }

    // POST: Crear nuevo artículo
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { codigo_producto, nombre, categoria, precio_unitario, costo_unitario } = body;

      if (!nombre) {
        return res.status(400).json({ ok: false, error: 'Nombre del artículo requerido' });
      }

      if (isSupabase()) {
        let finalCodigo = codigo_producto ? codigo_producto.trim() : null;
        if (!finalCodigo) {
          const list = await supabaseFetch('samar_articulos?select=codigo_producto&order=codigo_producto.desc&limit=1');
          let nextCod = 78;
          if (list && list.length > 0) {
            const raw = (list[0].codigo_producto || '').replace(/\D/g, '');
            const parsed = parseInt(raw, 10);
            if (!isNaN(parsed)) nextCod = parsed + 1;
          }
          finalCodigo = 'ART' + nextCod.toString().padStart(4, '0');
        }

        const payload = {
          codigo_producto: finalCodigo,
          nombre: nombre.trim(),
          categoria: (categoria || 'General').trim(),
          precio_unitario: parseFloat(precio_unitario) || 0,
          costo_unitario: parseFloat(costo_unitario) || 0
        };

        await supabaseFetch('samar_articulos', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(payload)
        });

        return res.status(201).json({
          ok: true,
          message: 'Artículo registrado (Replicado a consolidado.PRODUCTO_CONSOLIDADO vía Trigger)',
          id: finalCodigo
        });
      }

      const pool = await getPool();
      let finalCodigo = codigo_producto ? codigo_producto.trim() : null;
      if (!finalCodigo) {
        const maxRes = await pool.request().query(`
          SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(CODIGO_PRODUCTO, 4, 10) AS INT)), 77) AS maxCod
          FROM samar.ARTICULOS
        `);
        const nextCod = (maxRes.recordset[0].maxCod || 77) + 1;
        finalCodigo = 'ART' + nextCod.toString().padStart(4, '0');
      }

      await pool.request()
        .input('cod', sql.NVarChar(255), finalCodigo)
        .input('nom', sql.NVarChar(255), nombre.trim())
        .input('cat', sql.NVarChar(255), (categoria || 'General').trim())
        .input('precio', sql.Int, precio_unitario ? parseInt(precio_unitario, 10) : 0)
        .input('costo', sql.Int, costo_unitario ? parseInt(costo_unitario, 10) : 0)
        .query(`
          INSERT INTO samar.ARTICULOS (CODIGO_PRODUCTO, NOMBRE, CATEGORIA, PRECIO_UNITARIO, COSTO_UNITARIO)
          VALUES (@cod, @nom, @cat, @precio, @costo);
        `);

      return res.status(201).json({
        ok: true,
        message: 'Artículo registrado (Replicado a consolidado.PRODUCTO_CONSOLIDADO vía Trigger)',
        id: finalCodigo
      });
    }

    // PUT: Actualizar artículo
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const cod = req.query.id || body.codigo_producto;

      if (!cod) return res.status(400).json({ ok: false, error: 'Código de artículo requerido' });

      const { nombre, categoria, precio_unitario, costo_unitario } = body;

      if (isSupabase()) {
        const payload = {
          nombre: (nombre || '').trim(),
          categoria: (categoria || 'General').trim(),
          precio_unitario: parseFloat(precio_unitario) || 0,
          costo_unitario: parseFloat(costo_unitario) || 0
        };
        await supabaseFetch(`samar_articulos?codigo_producto=eq.${encodeURIComponent(cod)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        return res.status(200).json({ ok: true, message: 'Artículo actualizado correctamente' });
      }

      const pool = await getPool();
      await pool.request()
        .input('cod', sql.NVarChar(255), cod)
        .input('nom', sql.NVarChar(255), (nombre || '').trim())
        .input('cat', sql.NVarChar(255), (categoria || 'General').trim())
        .input('precio', sql.Int, precio_unitario ? parseInt(precio_unitario, 10) : 0)
        .input('costo', sql.Int, costo_unitario ? parseInt(costo_unitario, 10) : 0)
        .query(`
          UPDATE samar.ARTICULOS
          SET
            NOMBRE = @nom,
            CATEGORIA = @cat,
            PRECIO_UNITARIO = @precio,
            COSTO_UNITARIO = @costo
          WHERE CODIGO_PRODUCTO = @cod;
        `);

      return res.status(200).json({ ok: true, message: 'Artículo actualizado correctamente' });
    }

    // DELETE: Eliminar artículo
    if (req.method === 'DELETE') {
      const cod = req.query.id;
      if (!cod) return res.status(400).json({ ok: false, error: 'Código requerido' });

      if (isSupabase()) {
        await supabaseFetch(`samar_articulos?codigo_producto=eq.${encodeURIComponent(cod)}`, {
          method: 'DELETE'
        });
        return res.status(200).json({ ok: true, message: 'Artículo eliminado' });
      }

      const pool = await getPool();
      await pool.request()
        .input('cod', sql.NVarChar(255), cod)
        .query(`DELETE FROM samar.ARTICULOS WHERE CODIGO_PRODUCTO = @cod;`);

      return res.status(200).json({ ok: true, message: 'Artículo eliminado' });
    }

    return res.status(405).json({ ok: false, error: 'Método no soportado' });
  } catch (err) {
    console.error('Error en API articulos Samar:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
