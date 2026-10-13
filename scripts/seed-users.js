const sql = require('mssql');
const { hashPassword } = require('./auth-util');
const path = require('path');
const fs = require('fs');

// Intentar leer .env de veterinaria o samar
let server = process.env.DB_SERVER || 'localhost';
let database = process.env.DB_NAME || 'BD_CONSOLIDADO';
let user = process.env.DB_USER;
let password = process.env.DB_PASSWORD;

const envFile = path.join(__dirname, '..', 'veterinaria', '.env');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const l of lines) {
    const trimmed = l.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [k, v] = trimmed.split('=');
    if (k && v) {
      if (k === 'DB_SERVER') server = v.trim();
      if (k === 'DB_NAME') database = v.trim();
      if (k === 'DB_USER') user = v.trim();
      if (k === 'DB_PASSWORD') password = v.trim();
    }
  }
}

async function seed() {
  console.log(`Conectando a [${server}].[${database}]...`);
  const config = {
    server,
    database,
    options: {
      encrypt: server.includes('database.windows.net'),
      trustServerCertificate: true,
      enableArithAbort: true
    }
  };
  if (user && password) {
    config.user = user;
    config.password = password;
  }

  const pool = await new sql.ConnectionPool(config).connect();
  console.log('Conexión establecida.');

  const defaultPassword = 'admin';
  const defaultHash = hashPassword(defaultPassword);

  const usuarios = [
    { sistema: 'VETERINARIA', usuario: 'admin', nombre: 'Administrador Veterinaria', hash: defaultHash },
    { sistema: 'VETERINARIA', usuario: 'castillon', nombre: 'Ing. Luis Castillon', hash: defaultHash },
    { sistema: 'SAMAR', usuario: 'admin', nombre: 'Administrador Samar', hash: defaultHash },
    { sistema: 'SAMAR', usuario: 'castillon', nombre: 'Ing. Luis Castillon', hash: defaultHash }
  ];

  for (const u of usuarios) {
    await pool.request()
      .input('sis', sql.VarChar(20), u.sistema)
      .input('usr', sql.VarChar(50), u.usuario)
      .input('nom', sql.NVarChar(100), u.nombre)
      .input('hash', sql.VarChar(255), u.hash)
      .query(`
        IF EXISTS (SELECT 1 FROM seguridad.USUARIO_WEB WHERE SISTEMA = @sis AND USUARIO = @usr)
        BEGIN
          UPDATE seguridad.USUARIO_WEB
          SET CLAVE_HASH = @hash, NOMBRE = @nom, ESTADO = '1'
          WHERE SISTEMA = @sis AND USUARIO = @usr;
        END
        ELSE
        BEGIN
          INSERT INTO seguridad.USUARIO_WEB (SISTEMA, USUARIO, CLAVE_HASH, NOMBRE, ESTADO)
          VALUES (@sis, @usr, @hash, @nom, '1');
        END
      `);
    console.log(`[OK] Usuario ${u.sistema} -> ${u.usuario} / Clave: ${defaultPassword}`);
  }

  await pool.close();
  console.log('\nUsuarios creados correctamente en seguridad.USUARIO_WEB');
}

seed().catch(err => {
  console.error('Error sembrando usuarios:', err);
  process.exit(1);
});
