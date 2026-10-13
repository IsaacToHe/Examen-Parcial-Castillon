const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Cargar manejadores de API
const handlers = {
  '/api/auth': require('./api/auth'),
  '/api/personas': require('./api/personas'),
  '/api/productos': require('./api/productos'),
  '/api/stats': require('./api/stats')
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Adaptador para req / res compatible con Vercel
  req.query = parsedUrl.query;
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (obj) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };

  // Si es ruta de API
  const handlerKey = Object.keys(handlers).find(h => pathname === h || pathname.startsWith(h + '/'));
  if (handlerKey) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (body) {
        try { req.body = JSON.parse(body); } catch (e) { req.body = body; }
      }
      handlers[handlerKey](req, res).catch(err => {
        console.error('Error no capturado en API:', err);
        res.status(500).json({ ok: false, error: err.message });
      });
    });
    return;
  }

  // Si es archivo estático
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  SISTEMA WEB VETERINARIA (OLTP - ETL en Tiempo Real)`);
  console.log(`  Servidor local corriendo en: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
