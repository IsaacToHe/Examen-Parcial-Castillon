const { getPool, sql } = require('./_db');
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
    const pool = await getPool();

    // GET: Listar o buscar clientes en samar.CLIENTES
    if (req.method === 'GET') {
      const q = req.query.q ? req.query.q.trim() : '';
      let query = `
        SELECT TOP 100
          ID_CLIENTE,
          NOMBRE,
          APELLIDO,
          EDAD,
          ESTADO_CIVIL,
          RESIDENCIA,
          ORIGEN
        FROM samar.CLIENTES
      `;

      if (q) {
        query += ` WHERE (ID_CLIENTE LIKE @q OR NOMBRE LIKE @q OR APELLIDO LIKE @q OR RESIDENCIA LIKE @q) `;
      }

      query += ` ORDER BY ID_CLIENTE DESC`;

      const request = pool.request();
      if (q) request.input('q', sql.NVarChar(100), `%${q}%`);

      const result = await request.query(query);
      return res.status(200).json({ ok: true, data: result.recordset });
    }

    // POST: Crear nuevo Cliente en samar.CLIENTES
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { id_cliente, nombre, apellido, edad, estado_civil, residencia, origen } = body;

      if (!nombre || !apellido) {
        return res.status(400).json({ ok: false, error: 'Nombre y Apellido son obligatorios' });
      }

      // Si no viene ID, generar el siguiente CLI#####
      let finalId = id_cliente ? id_cliente.trim() : null;
      if (!finalId) {
        const maxRes = await pool.request().query(`
          SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(ID_CLIENTE, 4, 10) AS INT)), 1000) AS maxId
          FROM samar.CLIENTES
        `);
        const nextNum = (maxRes.recordset[0].maxId || 1000) + 1;
        finalId = 'CLI' + nextNum.toString().padStart(5, '0');
      }

      await pool.request()
        .input('id', sql.NVarChar(255), finalId)
        .input('nom', sql.NVarChar(255), nombre.trim())
        .input('ape', sql.NVarChar(255), apellido.trim())
        .input('edad', sql.SmallInt, edad ? parseInt(edad, 10) : null)
        .input('ec', sql.NVarChar(255), estado_civil || 'Soltero')
        .input('res', sql.NVarChar(255), residencia || 'Santiago')
        .input('ori', sql.NVarChar(255), origen || 'Santiago')
        .query(`
          INSERT INTO samar.CLIENTES (ID_CLIENTE, NOMBRE, APELLIDO, EDAD, ESTADO_CIVIL, RESIDENCIA, ORIGEN)
          VALUES (@id, @nom, @ape, @edad, @ec, @res, @ori);
        `);

      return res.status(201).json({
        ok: true,
        message: 'Cliente creado con éxito (Replicado a consolidado.CLIENTE_CONSOLIDADO vía Trigger)',
        id: finalId
      });
    }

    // PUT: Actualizar Cliente
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const id = req.query.id || body.id_cliente;

      if (!id) return res.status(400).json({ ok: false, error: 'ID de cliente requerido' });

      const { nombre, apellido, edad, estado_civil, residencia, origen } = body;

      await pool.request()
        .input('id', sql.NVarChar(255), id)
        .input('nom', sql.NVarChar(255), (nombre || '').trim())
        .input('ape', sql.NVarChar(255), (apellido || '').trim())
        .input('edad', sql.SmallInt, edad ? parseInt(edad, 10) : null)
        .input('ec', sql.NVarChar(255), estado_civil || 'Soltero')
        .input('res', sql.NVarChar(255), residencia || '')
        .input('ori', sql.NVarChar(255), origen || '')
        .query(`
          UPDATE samar.CLIENTES
          SET
            NOMBRE = @nom,
            APELLIDO = @ape,
            EDAD = @edad,
            ESTADO_CIVIL = @ec,
            RESIDENCIA = @res,
            ORIGEN = @ori
          WHERE ID_CLIENTE = @id;
        `);

      return res.status(200).json({ ok: true, message: 'Cliente actualizado correctamente' });
    }

    // DELETE: Eliminar Cliente
    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ ok: false, error: 'ID requerido' });

      await pool.request()
        .input('id', sql.NVarChar(255), id)
        .query(`DELETE FROM samar.CLIENTES WHERE ID_CLIENTE = @id;`);

      return res.status(200).json({ ok: true, message: 'Cliente eliminado correctamente' });
    }

    return res.status(405).json({ ok: false, error: 'Método no soportado' });
  } catch (err) {
    console.error('Error en API clientes Samar:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
