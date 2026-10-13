const { getPool } = require('./_db');
const { verifyToken, extractToken } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = extractToken(req);
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ ok: false, error: 'No autorizado' });

  try {
    const pool = await getPool();
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM vet.PERSONA WHERE ESTADO = '1') AS totalPersonas,
        (SELECT COUNT(*) FROM vet.CLIENTE WHERE ESTADO = '1') AS totalClientes,
        (SELECT COUNT(*) FROM vet.PRODUCTO WHERE ESTADO = '1') AS totalProductos,
        (SELECT COUNT(*) FROM consolidado.CLIENTE_CONSOLIDADO WHERE SISTEMA = 'VETERINARIA') AS totalConsolidadoClientes,
        (SELECT COUNT(*) FROM consolidado.PRODUCTO_CONSOLIDADO WHERE SISTEMA = 'VETERINARIA') AS totalConsolidadoProductos,
        (SELECT TOP 1 FECHA_ACTUALIZACION FROM consolidado.CLIENTE_CONSOLIDADO ORDER BY FECHA_ACTUALIZACION DESC) AS ultimaSincro
    `;
    const result = await pool.request().query(statsQuery);
    return res.status(200).json({ ok: true, data: result.recordset[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
