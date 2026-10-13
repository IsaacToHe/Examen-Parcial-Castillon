const { isSupabase, supabaseFetchCount, getPool } = require('./_db');
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
    if (isSupabase()) {
      const [totalClientes, totalArticulos, totalConsolidadoClientes, totalConsolidadoProductos] = await Promise.all([
        supabaseFetchCount('samar_clientes'),
        supabaseFetchCount('samar_articulos'),
        supabaseFetchCount('cliente_consolidado?origen_bd=eq.SAMAR'),
        supabaseFetchCount('producto_consolidado?origen_bd=eq.SAMAR')
      ]);

      return res.status(200).json({
        ok: true,
        data: {
          totalClientes,
          totalArticulos,
          totalDwClientes: 1000,
          totalConsolidadoClientes,
          totalConsolidadoProductos,
          ultimaSincro: new Date().toISOString()
        }
      });
    }

    const pool = await getPool();
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM samar.CLIENTES) AS totalClientes,
        (SELECT COUNT(*) FROM samar.ARTICULOS) AS totalArticulos,
        (SELECT COUNT(*) FROM dw.DIM_CLIENTE) AS totalDwClientes,
        (SELECT COUNT(*) FROM consolidado.CLIENTE_CONSOLIDADO WHERE SISTEMA = 'SAMAR') AS totalConsolidadoClientes,
        (SELECT COUNT(*) FROM consolidado.PRODUCTO_CONSOLIDADO WHERE SISTEMA = 'SAMAR') AS totalConsolidadoProductos,
        (SELECT TOP 1 FECHA_ACTUALIZACION FROM consolidado.CLIENTE_CONSOLIDADO WHERE SISTEMA = 'SAMAR' ORDER BY FECHA_ACTUALIZACION DESC) AS ultimaSincro
    `;
    const result = await pool.request().query(statsQuery);
    return res.status(200).json({ ok: true, data: result.recordset[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
