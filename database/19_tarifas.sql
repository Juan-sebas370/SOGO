-- =====================================================================
-- Tarifas editables desde SOGO y usadas por la página web.
--
--  1. Tabla `tarifas_reserva`: precio POR PERSONA de cada tipo de reserva
--     (individual, familiar, pasadía, grupo de trabajo) en cada temporada.
--     Hospedaje: por persona y noche. Pasadía / grupo: por persona y día.
--     Reglas de niños (las aplica la web y su backend): de 4 a 10 años pagan
--     el 60 %, de 0 a 3 años no pagan, desde los 11 años tarifa completa.
--
--  2. Columnas `precio_media` y `precio_alta` en `habitaciones`. La columna
--     existente `precio_noche` es la tarifa de temporada BAJA (se conserva el
--     nombre para no romper lo que ya la usa). Son el precio por noche de la
--     habitación que muestra la página web.
--
-- Temporadas (las calcula el sistema por fecha de llegada):
--   Alta : 15 dic – 15 ene, 15 jun – 15 jul y Semana Santa.
--   Media: fines de semana y festivos.
--   Baja : el resto del año.
--
-- Los valores iniciales son un punto de partida: revísalos en
-- SOGO › Alojamiento › Tarifas y temporadas. Se puede ejecutar más de una vez.
-- =====================================================================
USE hotel_sebastian;

CREATE TABLE IF NOT EXISTS tarifas_reserva (
  id                 BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tipo_reserva       VARCHAR(20)  NOT NULL,
  nombre             VARCHAR(60)  NOT NULL,
  precio_baja        DOUBLE       NOT NULL,
  precio_media       DOUBLE       NOT NULL,
  precio_alta        DOUBLE       NOT NULL,
  fecha_modificacion DATETIME     NULL,
  CONSTRAINT uk_tarifas_reserva_tipo UNIQUE (tipo_reserva)
);

INSERT IGNORE INTO tarifas_reserva (tipo_reserva, nombre, precio_baja, precio_media, precio_alta, fecha_modificacion) VALUES
  ('individual', 'Hospedaje individual', 35000, 45000, 60000, NOW()),
  ('familiar',   'Familia o grupo',      35000, 45000, 60000, NOW()),
  ('pasadia',    'Pasadía',              35000, 45000, 60000, NOW()),
  ('grupal',     'Grupo de trabajo',     60000, 75000, 90000, NOW());

-- Corrige el nombre si se guardó con la codificación equivocada («PasadÃ­a»)
SET SQL_SAFE_UPDATES = 0;
UPDATE tarifas_reserva SET nombre = _utf8mb4'Pasadía' WHERE tipo_reserva = 'pasadia' AND nombre <> _utf8mb4'Pasadía';
SET SQL_SAFE_UPDATES = 1;

-- Columnas de temporada en habitaciones (solo si no existen)
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'hotel_sebastian' AND TABLE_NAME = 'habitaciones' AND COLUMN_NAME = 'precio_media') = 0,
  'ALTER TABLE habitaciones ADD COLUMN precio_media DOUBLE NULL AFTER precio_noche',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'hotel_sebastian' AND TABLE_NAME = 'habitaciones' AND COLUMN_NAME = 'precio_alta') = 0,
  'ALTER TABLE habitaciones ADD COLUMN precio_alta DOUBLE NULL AFTER precio_media',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Valores iniciales de media y alta a partir de la tarifa baja (redondeados a $5.000)
SET SQL_SAFE_UPDATES = 0;
UPDATE habitaciones SET precio_media = ROUND(precio_noche * 1.27 / 5000) * 5000 WHERE precio_media IS NULL AND precio_noche IS NOT NULL;
UPDATE habitaciones SET precio_alta  = ROUND(precio_noche * 1.73 / 5000) * 5000 WHERE precio_alta  IS NULL AND precio_noche IS NOT NULL;
SET SQL_SAFE_UPDATES = 1;

-- Verificación
SELECT tipo_reserva, nombre, precio_baja, precio_media, precio_alta FROM tarifas_reserva ORDER BY id;
SELECT numero, precio_noche AS baja, precio_media AS media, precio_alta AS alta FROM habitaciones ORDER BY numero;
