const { isSupabase, supabaseFetch, toUpperKeys, getPool, sql } = require('./_db');
const { verifyPassword, createToken, verifyToken, extractToken } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: verificar sesion
  if (req.method === 'GET') {
    const token = extractToken(req);
    const user = verifyToken(token);
    if (!user || user.sistema !== 'VETERINARIA') {
      return res.status(401).json({ ok: false, error: 'Sesion invalida o expirada' });
    }
    return res.status(200).json({ ok: true, user });
  }

  // POST: Login
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { usuario, clave } = body;

      if (!usuario || !clave) {
        return res.status(400).json({ ok: false, error: 'Usuario y clave requeridos' });
      }

      let userRow = null;

      if (isSupabase()) {
        try {
          const users = await supabaseFetch(
            `usuario_web?sistema=eq.VETERINARIA&usuario=eq.${encodeURIComponent(usuario.trim())}&estado=eq.1&select=*`
          );
          if (users && users.length > 0) {
            userRow = toUpperKeys(users[0]);
          }
        } catch (e) {
          console.warn('Aviso: usuario_web en Supabase:', e.message);
        }
      } else {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input('sistema', sql.VarChar(20), 'VETERINARIA')
            .input('usuario', sql.VarChar(50), usuario.trim())
            .query(`
              SELECT IDUSUARIO, SISTEMA, USUARIO, CLAVE_HASH, NOMBRE, ESTADO
              FROM seguridad.USUARIO_WEB
              WHERE SISTEMA = @sistema AND USUARIO = @usuario AND ESTADO = '1'
            `);
          if (result.recordset.length > 0) {
            userRow = result.recordset[0];
          }
        } catch (e) {
          console.warn('Aviso: usuario_web en MSSQL:', e.message);
        }
      }

      // Credenciales maestras del examen si la tabla en BD aun no esta poblada:
      const u = (usuario || '').trim().toLowerCase();
      if (!userRow) {
        if ((u === 'admin' || u === 'castillon') && clave === 'admin') {
          userRow = {
            IDUSUARIO: u === 'admin' ? 1 : 2,
            USUARIO: u,
            NOMBRE: u === 'admin' ? 'Administrador Veterinaria' : 'Ing. Luis Castillon',
            SISTEMA: 'VETERINARIA'
          };
        }
      }

      if (!userRow) {
        return res.status(401).json({ ok: false, error: 'Usuario o clave incorrectos' });
      }

      // Si viene con hash de BD, verificarlo
      if (userRow.CLAVE_HASH || userRow.clave_hash) {
        const hash = userRow.CLAVE_HASH || userRow.clave_hash;
        const match = verifyPassword(clave, hash);
        if (!match) {
          return res.status(401).json({ ok: false, error: 'Usuario o clave incorrectos' });
        }
      }

      const userId = userRow.IDUSUARIO || userRow.idusuario || 1;
      const username = userRow.USUARIO || userRow.usuario || u;
      const nombre = userRow.NOMBRE || userRow.nombre || username;

      // Actualizar ultimo acceso
      if (isSupabase()) {
        supabaseFetch(`usuario_web?idusuario=eq.${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ ultimo_acceso: new Date().toISOString() })
        }).catch(() => {});
      } else {
        getPool().then(p => {
          p.request().input('id', sql.Int, userId)
            .query(`UPDATE seguridad.USUARIO_WEB SET ULTIMO_ACCESO = SYSDATETIME() WHERE IDUSUARIO = @id`);
        }).catch(() => {});
      }

      const token = createToken({
        id: userId,
        usuario: username,
        nombre: nombre,
        sistema: 'VETERINARIA'
      });

      return res.status(200).json({
        ok: true,
        token,
        usuario: {
          id: userId,
          usuario: username,
          nombre: nombre,
          sistema: 'VETERINARIA'
        }
      });
    } catch (err) {
      console.error('Error en login Veterinaria:', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(405).json({ ok: false, error: 'Método no soportado' });
};
