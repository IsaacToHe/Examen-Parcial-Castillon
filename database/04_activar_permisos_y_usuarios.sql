-- =============================================================================
-- EXAMEN PARCIAL 2026 - SSTDD - PERMISOS Y USUARIOS EN SUPABASE
-- Copia y corre esto en: https://supabase.com/dashboard/project/vmrdmmmauslwnuesgfuk/sql/new
-- =============================================================================

-- 1. DESACTIVAR RLS EN TODAS LAS TABLAS PARA ACCESO COMPLETO DE LA API
ALTER TABLE IF EXISTS usuario_web DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vet_distrito DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vet_categoria DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vet_unidad_medida DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vet_persona DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vet_producto DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS samar_clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS samar_articulos DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cliente_consolidado DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS producto_consolidado DISABLE ROW LEVEL SECURITY;

-- 2. OTORGAR PERMISOS TOTALES
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 3. INSERTAR O ACTUALIZAR USUARIOS DE EVALUACIÓN
INSERT INTO usuario_web (idusuario, sistema, usuario, clave_hash, nombre, estado) VALUES
(1, 'VETERINARIA', 'admin', 'bf93050db1010b6f0221f82174ed5b96:7e5147e27cef7e668c9f428ccf476a203019243de1be5fc727b62cd43cf55e6fd405f6efba2b69c818c52f55b30b01eae925ab4624d9ec9406f0f9e12d215cbc', 'Administrador Veterinaria', '1'),
(2, 'VETERINARIA', 'castillon', 'bf93050db1010b6f0221f82174ed5b96:7e5147e27cef7e668c9f428ccf476a203019243de1be5fc727b62cd43cf55e6fd405f6efba2b69c818c52f55b30b01eae925ab4624d9ec9406f0f9e12d215cbc', 'Ing. Luis Castillon', '1'),
(3, 'SAMAR', 'admin', 'bf93050db1010b6f0221f82174ed5b96:7e5147e27cef7e668c9f428ccf476a203019243de1be5fc727b62cd43cf55e6fd405f6efba2b69c818c52f55b30b01eae925ab4624d9ec9406f0f9e12d215cbc', 'Administrador Samar', '1'),
(4, 'SAMAR', 'castillon', 'bf93050db1010b6f0221f82174ed5b96:7e5147e27cef7e668c9f428ccf476a203019243de1be5fc727b62cd43cf55e6fd405f6efba2b69c818c52f55b30b01eae925ab4624d9ec9406f0f9e12d215cbc', 'Ing. Luis Castillon', '1')
ON CONFLICT (idusuario) DO UPDATE SET
  clave_hash = EXCLUDED.clave_hash,
  estado = '1';

SELECT setval('usuario_web_idusuario_seq', COALESCE((SELECT MAX(idusuario) FROM usuario_web), 1));
