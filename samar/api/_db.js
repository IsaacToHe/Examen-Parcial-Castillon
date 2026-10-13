const sql = require('mssql');
const path = require('path');
const fs = require('fs');

// Cargar .env si existe en el directorio local
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const k = trimmed.substring(0, idx).trim();
      const v = trimmed.substring(idx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

let pool = null;

async function getPool() {
  if (pool && pool.connected) return pool;

  const server = process.env.DB_SERVER || 'localhost';
  const database = process.env.DB_NAME || 'BD_CONSOLIDADO';
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = parseInt(process.env.DB_PORT || '1433', 10);

  const config = {
    server,
    database,
    port,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true' || server.includes('database.windows.net'),
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 15000,
      requestTimeout: 30000
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  if (user && password) {
    config.user = user;
    config.password = password;
  }

  try {
    pool = await new sql.ConnectionPool(config).connect();
    return pool;
  } catch (err) {
    console.error('Error conectando a SQL Server / Azure SQL:', err.message);
    throw err;
  }
}

module.exports = { sql, getPool };
