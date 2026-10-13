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
      let v = trimmed.substring(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function isSupabase() {
  return !!(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.ANONKEY));
}

function getSupabaseKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.ANONKEY || '';
}

function getSupabaseUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

async function supabaseFetch(endpoint, options = {}) {
  const url = `${getSupabaseUrl()}/rest/v1/${endpoint.replace(/^\//, '')}`;
  const key = getSupabaseKey();
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    let errJson;
    try { errJson = JSON.parse(text); } catch {}
    const msg = errJson?.message || errJson?.hint || errJson?.details || text || `HTTP ${res.status}`;
    throw new Error(`Supabase error: ${msg}`);
  }

  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  return await res.text();
}

async function supabaseFetchCount(endpoint) {
  const url = `${getSupabaseUrl()}/rest/v1/${endpoint.replace(/^\//, '')}`;
  const key = getSupabaseKey();
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Prefer': 'count=exact',
    'Range': '0-0'
  };

  const res = await fetch(url, { headers });
  const range = res.headers.get('content-range');
  if (range && range.includes('/')) {
    const total = parseInt(range.split('/')[1], 10);
    return isNaN(total) ? 0 : total;
  }
  return 0;
}

function toUpperKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toUpperKeys);
  const out = {};
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    const transformed = (val && typeof val === 'object' && !(val instanceof Date)) ? toUpperKeys(val) : val;
    out[k.toUpperCase()] = transformed;
    out[k.toLowerCase()] = transformed;
  }
  return out;
}

// Fallback MSSQL
let pool = null;
let sql = null;
try {
  sql = require('mssql');
} catch {}

async function getPool() {
  if (pool && pool.connected) return pool;
  if (!sql) throw new Error('mssql module not available');

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

  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

module.exports = {
  isSupabase,
  supabaseFetch,
  supabaseFetchCount,
  toUpperKeys,
  sql,
  getPool
};
