const { isSupabase, supabaseFetch, toUpperKeys, getPool, sql } = require('./_db');
const { verifyToken, extractToken } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verificar autenticación
  const token = extractToken(req);
  const user = verifyToken(token);
  if (!user || user.sistema !== 'VETERINARIA') {
    return res.status(401).json({ ok: false, error: 'Acceso no autorizado' });
  }

  try {
    // GET: Listar / Buscar personas
    if (req.method === 'GET') {
      const q = req.query.q ? req.query.q.trim() : '';

      if (isSupabase()) {
        let endpoint = 'vet_persona?select=idpersona,dni,nombre,ape_paterno,ape_materno,fechnac,genero,celular,correo,direccion,est_civil,iddistrito,estado,vet_distrito(nomdistrito)&order=idpersona.desc&limit=100';
        if (q) {
          endpoint += `&or=(dni.ilike.*${encodeURIComponent(q)}*,nombre.ilike.*${encodeURIComponent(q)}*,ape_paterno.ilike.*${encodeURIComponent(q)}*,ape_materno.ilike.*${encodeURIComponent(q)}*,celular.ilike.*${encodeURIComponent(q)}*)`;
        }
        const data = await supabaseFetch(endpoint);
        const mapped = (data || []).map(p => {
          const upper = toUpperKeys(p);
          upper.NOMDISTRITO = p.vet_distrito?.nomdistrito || '';
          return upper;
        });
        return res.status(200).json({ ok: true, data: mapped });
      }

      const pool = await getPool();
      let query = `
        SELECT TOP 100
          p.IDPERSONA,
          p.DNI,
          p.NOMBRE,
          p.APE_PATERNO,
          p.APE_MATERNO,
          p.FECHNAC,
          p.GENERO,
          p.CELULAR,
          p.CORREO,
          p.DIRECCION,
          p.EST_CIVIL,
          p.IDDISTRITO,
          p.ESTADO,
          d.NOMDISTRITO
        FROM vet.PERSONA p
        LEFT JOIN vet.DISTRITO d ON d.IDDISTRITO = p.IDDISTRITO
      `;

      if (q) {
        query += `
          WHERE (p.DNI LIKE @q OR p.NOMBRE LIKE @q OR p.APE_PATERNO LIKE @q OR p.APE_MATERNO LIKE @q OR p.CELULAR LIKE @q)
        `;
      }

      query += ` ORDER BY p.IDPERSONA DESC`;

      const request = pool.request();
      if (q) request.input('q', sql.VarChar(100), `%${q}%`);

      const result = await request.query(query);
      return res.status(200).json({ ok: true, data: result.recordset });
    }

    // POST: Crear Persona (dispara triggers automáticos a cliente_consolidado)
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const {
        dni,
        nombre,
        ape_paterno,
        ape_materno,
        fechnac,
        genero,
        celular,
        correo,
        direccion,
        est_civil,
        iddistrito
      } = body;

      if (!dni || !nombre || !ape_paterno) {
        return res.status(400).json({ ok: false, error: 'DNI, Nombre y Apellido Paterno son obligatorios' });
      }

      if (isSupabase()) {
        const payload = {
          dni: dni.toString().padStart(8, '0').slice(0, 8),
          nombre: nombre.trim().slice(0, 30),
          ape_paterno: ape_paterno.trim().slice(0, 30),
          ape_materno: (ape_materno || '').trim().slice(0, 30),
          fechnac: fechnac || null,
          genero: (genero || 'M').toUpperCase().slice(0, 1),
          celular: (celular || '').toString().slice(0, 10),
          correo: (correo || '').trim().slice(0, 30),
          direccion: (direccion || '').trim().slice(0, 120),
          est_civil: (est_civil || 'SO').toUpperCase().slice(0, 2),
          iddistrito: iddistrito ? parseInt(iddistrito, 10) : 1,
          usucre: user.usuario,
          estado: '1'
        };
        const created = await supabaseFetch('vet_persona', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(payload)
        });
        const newId = Array.isArray(created) ? created[0].idpersona : created?.idpersona;
        return res.status(201).json({
          ok: true,
          message: 'Persona registrada con éxito (Replicada a BD_CONSOLIDADO vía Trigger)',
          id: newId
        });
      }

      const pool = await getPool();
      const request = pool.request()
        .input('dni', sql.Char(8), dni.toString().padStart(8, '0').slice(0, 8))
        .input('nombre', sql.VarChar(30), nombre.trim().slice(0, 30))
        .input('ape_pat', sql.VarChar(30), ape_paterno.trim().slice(0, 30))
        .input('ape_mat', sql.VarChar(30), (ape_materno || '').trim().slice(0, 30))
        .input('fechnac', sql.Date, fechnac ? new Date(fechnac) : null)
        .input('genero', sql.Char(1), (genero || 'M').toUpperCase().slice(0, 1))
        .input('celular', sql.VarChar(10), (celular || '').toString().slice(0, 10))
        .input('correo', sql.VarChar(30), (correo || '').trim().slice(0, 30))
        .input('direccion', sql.VarChar(120), (direccion || '').trim().slice(0, 120))
        .input('est_civil', sql.Char(2), (est_civil || 'SO').toUpperCase().slice(0, 2))
        .input('iddistrito', sql.Int, iddistrito ? parseInt(iddistrito, 10) : 1)
        .input('usucre', sql.VarChar(30), user.usuario);

      const insertResult = await request.query(`
        INSERT INTO vet.PERSONA
          (DNI, NOMBRE, APE_PATERNO, APE_MATERNO, FECHNAC, GENERO, CELULAR, CORREO, DIRECCION, EST_CIVIL, IDDISTRITO, USUCRE, FECCRE, ESTADO)
        OUTPUT INSERTED.IDPERSONA
        VALUES
          (@dni, @nombre, @ape_pat, @ape_mat, @fechnac, @genero, @celular, @correo, @direccion, @est_civil, @iddistrito, @usucre, SYSDATETIME(), '1');
      `);

      const newId = insertResult.recordset[0].IDPERSONA;

      return res.status(201).json({
        ok: true,
        message: 'Persona registrada con éxito (Replicada a BD_CONSOLIDADO vía Trigger)',
        id: newId
      });
    }

    // PUT: Actualizar Persona
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const id = parseInt(req.query.id || body.idpersona, 10);

      if (!id) return res.status(400).json({ ok: false, error: 'ID de persona requerido' });

      const {
        dni,
        nombre,
        ape_paterno,
        ape_materno,
        fechnac,
        genero,
        celular,
        correo,
        direccion,
        est_civil,
        iddistrito,
        estado
      } = body;

      if (isSupabase()) {
        const payload = {
          dni: (dni || '').toString().slice(0, 8),
          nombre: (nombre || '').trim().slice(0, 30),
          ape_paterno: (ape_paterno || '').trim().slice(0, 30),
          ape_materno: (ape_materno || '').trim().slice(0, 30),
          fechnac: fechnac || null,
          genero: (genero || 'M').toUpperCase().slice(0, 1),
          celular: (celular || '').toString().slice(0, 10),
          correo: (correo || '').trim().slice(0, 30),
          direccion: (direccion || '').trim().slice(0, 120),
          est_civil: (est_civil || 'SO').toUpperCase().slice(0, 2),
          iddistrito: iddistrito ? parseInt(iddistrito, 10) : 1,
          estado: (estado || '1').slice(0, 1),
          usumod: user.usuario,
          fecmod: new Date().toISOString()
        };
        await supabaseFetch(`vet_persona?idpersona=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        return res.status(200).json({ ok: true, message: 'Persona actualizada correctamente' });
      }

      const pool = await getPool();
      const request = pool.request()
        .input('id', sql.Int, id)
        .input('dni', sql.Char(8), (dni || '').toString().slice(0, 8))
        .input('nombre', sql.VarChar(30), (nombre || '').trim().slice(0, 30))
        .input('ape_pat', sql.VarChar(30), (ape_paterno || '').trim().slice(0, 30))
        .input('ape_mat', sql.VarChar(30), (ape_materno || '').trim().slice(0, 30))
        .input('fechnac', sql.Date, fechnac ? new Date(fechnac) : null)
        .input('genero', sql.Char(1), (genero || 'M').toUpperCase().slice(0, 1))
        .input('celular', sql.VarChar(10), (celular || '').toString().slice(0, 10))
        .input('correo', sql.VarChar(30), (correo || '').trim().slice(0, 30))
        .input('direccion', sql.VarChar(120), (direccion || '').trim().slice(0, 120))
        .input('est_civil', sql.Char(2), (est_civil || 'SO').toUpperCase().slice(0, 2))
        .input('iddistrito', sql.Int, iddistrito ? parseInt(iddistrito, 10) : 1)
        .input('estado', sql.Char(1), (estado || '1').slice(0, 1))
        .input('usumod', sql.VarChar(30), user.usuario);

      await request.query(`
        UPDATE vet.PERSONA
        SET
          DNI = @dni,
          NOMBRE = @nombre,
          APE_PATERNO = @ape_pat,
          APE_MATERNO = @ape_mat,
          FECHNAC = @fechnac,
          GENERO = @genero,
          CELULAR = @celular,
          CORREO = @correo,
          DIRECCION = @direccion,
          EST_CIVIL = @est_civil,
          IDDISTRITO = @iddistrito,
          ESTADO = @estado,
          USUMOD = @usumod,
          FECMOD = SYSDATETIME()
        WHERE IDPERSONA = @id
      `);

      return res.status(200).json({ ok: true, message: 'Persona actualizada correctamente' });
    }

    // DELETE: Eliminar o desactivar Persona
    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id, 10);
      if (!id) return res.status(400).json({ ok: false, error: 'ID requerido' });

      if (isSupabase()) {
        await supabaseFetch(`vet_persona?idpersona=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ estado: '0', usumod: user.usuario, fecmod: new Date().toISOString() })
        });
        return res.status(200).json({ ok: true, message: 'Persona desactivada correctamente' });
      }

      const pool = await getPool();
      await pool.request()
        .input('id', sql.Int, id)
        .input('usumod', sql.VarChar(30), user.usuario)
        .query(`
          UPDATE vet.PERSONA
          SET ESTADO = '0', USUMOD = @usumod, FECMOD = SYSDATETIME()
          WHERE IDPERSONA = @id
        `);

      return res.status(200).json({ ok: true, message: 'Persona desactivada correctamente' });
    }

    return res.status(405).json({ ok: false, error: 'Método no soportado' });
  } catch (err) {
    console.error('Error en API personas:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
