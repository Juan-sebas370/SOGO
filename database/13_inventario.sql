-- =====================================================================
-- Inventarios en la base de datos
--
--  · categorias_inventario.en_uso: Alimentos y Bebidas quedan EN PAUSA
--    (el hospedaje no vende comida ni bebidas por ahora). Sus productos se
--    conservan en el catálogo con todo en 0, sin alertas y sin entradas.
--  · productos_inventario.historial: cambios de cada producto (quién y cuándo).
--  · movimientos_inventario.usuario_nombre: quién registró el movimiento.
--  · Catálogo inicial del hospedaje SIN existencias, costos ni proveedores
--    inventados: las cantidades reales se cargan con el primer conteo físico
--    (Inventarios › Ajustes › Inventario físico) o con las compras.
--  · configuracion 'inventario_alertas': días de aviso, stock bajo, etc.
--
-- Solo AGREGA columnas y filas: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 12.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── Columnas nuevas ─────────────────────────────────────────────────
ALTER TABLE categorias_inventario
  ADD COLUMN en_uso TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE productos_inventario
  ADD COLUMN historial JSON DEFAULT NULL;

ALTER TABLE movimientos_inventario
  ADD COLUMN usuario_nombre VARCHAR(160) DEFAULT NULL;

-- ── Categorías: comida y bebidas en pausa ───────────────────────────
INSERT IGNORE INTO categorias_inventario (nombre, prefijo) VALUES
  ('Alimentos', 'ALI'), ('Bebidas', 'BEB'), ('Aseo', 'ASE'), ('Amenities', 'AME'),
  ('Lencería', 'LEN'), ('Papelería', 'PAP'), ('Mantenimiento', 'MAN');
UPDATE categorias_inventario SET en_uso = 0 WHERE nombre IN ('Alimentos', 'Bebidas');
UPDATE categorias_inventario SET en_uso = 1 WHERE nombre NOT IN ('Alimentos', 'Bebidas');

-- ── Catálogo inicial (todo en 0) ────────────────────────────────────
-- Existencias 0, costo 0 y sin proveedor: se completan con datos reales.
-- El nivel mínimo es una sugerencia que se puede cambiar en cada producto.
INSERT IGNORE INTO productos_inventario
  (codigo, nombre, categoria_id, descripcion, unidad, existencias, stock_minimo, ubicacion, costo_unitario, precio_referencia, controla_vencimiento, historial)
SELECT x.codigo, x.nombre, c.id, '', x.unidad, 0, x.minimo, x.ubicacion, 0, NULL, x.vence,
       JSON_ARRAY(JSON_OBJECT('at', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i'), 'by', 'Juan Sebastián Pinilla',
         'text', IF(c.en_uso = 0, 'Producto en catálogo · categoría en pausa (no se usa por ahora)', 'Producto en catálogo · existencias por contar')))
FROM (
  SELECT 'ALI-001' codigo, 'Arroz blanco' nombre, 'Alimentos' cat, 'kg' unidad, 0 minimo, 'Bodega principal' ubicacion, 0 vence
  UNION ALL SELECT 'ALI-002', 'Fríjol cargamanto', 'Alimentos', 'kg', 0, 'Bodega principal', 0
  UNION ALL SELECT 'ALI-003', 'Huevos AA', 'Alimentos', 'cubeta x30', 0, 'Cocina', 1
  UNION ALL SELECT 'ALI-004', 'Café de origen', 'Alimentos', 'kg', 0, 'Bodega principal', 0
  UNION ALL SELECT 'BEB-001', 'Agua en botella 600 ml', 'Bebidas', 'und', 0, 'Bodega principal', 0
  UNION ALL SELECT 'BEB-002', 'Gaseosa 400 ml', 'Bebidas', 'und', 0, 'Bodega principal', 0
  UNION ALL SELECT 'BEB-003', 'Leche entera', 'Bebidas', 'litro', 0, 'Cocina', 1
  UNION ALL SELECT 'ASE-001', 'Detergente líquido', 'Aseo', 'galón', 3, 'Bodega de aseo', 0
  UNION ALL SELECT 'ASE-002', 'Desinfectante', 'Aseo', 'galón', 3, 'Bodega de aseo', 0
  UNION ALL SELECT 'ASE-003', 'Papel higiénico doble hoja', 'Aseo', 'paca x12', 4, 'Bodega de aseo', 0
  UNION ALL SELECT 'ASE-004', 'Toallín de cocina', 'Aseo', 'rollo', 4, 'Bodega de aseo', 0
  UNION ALL SELECT 'ASE-005', 'Jabón lavaplatos', 'Aseo', 'und', 3, 'Bodega de aseo', 0
  UNION ALL SELECT 'ASE-006', 'Bolsas de basura', 'Aseo', 'rollo', 3, 'Bodega de aseo', 0
  UNION ALL SELECT 'AME-001', 'Kit amenities (jabón, champú, acondicionador)', 'Amenities', 'kit', 20, 'Bodega de habitaciones', 0
  UNION ALL SELECT 'AME-002', 'Jabón de tocador 30 g', 'Amenities', 'und', 30, 'Bodega de habitaciones', 0
  UNION ALL SELECT 'LEN-001', 'Toalla de cuerpo blanca', 'Lencería', 'und', 10, 'Bodega de lencería', 0
  UNION ALL SELECT 'LEN-002', 'Juego de sábanas doble', 'Lencería', 'juego', 6, 'Bodega de lencería', 0
  UNION ALL SELECT 'LEN-003', 'Toalla de mano', 'Lencería', 'und', 10, 'Bodega de lencería', 0
  UNION ALL SELECT 'PAP-001', 'Resma papel carta', 'Papelería', 'resma', 1, 'Bodega principal', 0
  UNION ALL SELECT 'MAN-001', 'Bombillo LED 9 W', 'Mantenimiento', 'und', 4, 'Bodega de mantenimiento', 0
) x
JOIN categorias_inventario c ON c.nombre = x.cat;

-- ── Umbrales de alertas (Configuración › Metas e indicadores) ───────
INSERT IGNORE INTO configuracion (clave, valor) VALUES
  ('inventario_alertas', JSON_OBJECT('expiryDays', 7, 'lowStock', TRUE, 'unusualPct', 50, 'maxShrinkPct', 2));

-- ── Comprobación ────────────────────────────────────────────────────
SELECT c.nombre AS categoria, IF(c.en_uso, 'En uso', 'En pausa') AS estado, COUNT(p.id) AS productos,
       COALESCE(SUM(p.existencias), 0) AS existencias
FROM categorias_inventario c LEFT JOIN productos_inventario p ON p.categoria_id = c.id
GROUP BY c.id ORDER BY c.en_uso DESC, c.nombre;
