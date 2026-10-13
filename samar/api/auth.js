const { getPool, sql } = require('./_db');
const { verifyPassword, createToken, verifyToken, extractToken } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const token = extractToken(req);
    const user = verifyToken(token);
    if (!user || user.sistema !== 'SAMAR') {
      return res.status(401).json({ ok: false, error: 'Sesion invalida o expirada' });
    }
    return res.status(200).json({ ok: true, user });
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { usuario, clave } = body;

      if (!usuario || !clave) {
        return res.status(400).json({ ok: false, error: 'Usuario y clave requeridos' });
      }

      const pool = await getPool();
      const result = await pool.request()
        .input('sistema', sql.VarChar(20), 'SAMAR')
        .input('usuario', sql.VarChar(50), usuario.trim())
        .query(`
          SELECT IDUSUARIO, SISTEMA, USUARIO, CLAVE_HASH, NOMBRE, ESTADO
          FROM seguridad.USUARIO_WEB
          WHERE SISTEMA = @sistema AND USUARIO = @usuario AND ESTADO = '1'
        `);

      if (result.recordset.length === 0) {
        return res.status(401).json({ ok: false, error: 'Usuario o clave incorrectos' });
      }

      const userRow = result.recordset[0];
      const match = verifyPassword(clave, userRow.CLAVE_HASH);
      if (!match) {
        return res.status(401).json({ ok: false, error: 'Usuario o clave incorrectos' });
      }

      await pool.request()
        .input('id', sql.Int, userRow.IDUSUARIO)
        .query(`UPDATE seguridad.USUARIO_WEB SET ULTIMO_ACCESO = SYSDATETIME() WHERE IDUSUARIO = @id`);

      const token = createToken({
        id: userRow.IDUSUARIO,
        usuario: userRow.USUARIO,
        nombre: userRow.NOMBRE || userRow.USUARIO,
        sistema: 'SAMAR'
      });

      return res.status(200).json({
        ok: true,
        token,
        usuario: {
          id: userRow.IDUSUARIO,
          usuario: userRow.USUARIO,
          nombre: userRow.NOMBRE || userRow.USUARIO,
          sistema: 'SAMAR'
        }
      });
    } catch (err) {
      console.error('Error en login Samar:', err);
      return res.status(500).json({ ok: false, error: 'Error del servidor: ' + err.message });
    }
  }

  return res.status(405).json({ ok: false, error: 'Metodo no permitido' });
};
