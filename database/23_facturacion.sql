-- =====================================================================
-- 23 · Facturación electrónica guardada en la base de datos
--   · Las facturas, sus líneas y su historial ya tenían tablas (script 01);
--     se agregan los campos que faltaban para guardarlas desde SOGO.
--   · Datos del hospedaje (configuracion 'hospedaje'): los usan Facturación,
--     Contabilidad, Nómina, TRA y Reportes. Se cargan los datos públicos de
--     la página web; el NIT y el RNT quedan vacíos para escribirlos en
--     Configuración › Datos del hospedaje.
--   · Configuración de facturación (configuracion 'facturacion'): resolución,
--     proveedor tecnológico, tarifas de impuestos y plantilla de correo.
-- Solo agrega: no borra ni cambia datos existentes. Se puede ejecutar dos veces.
-- =====================================================================
USE hotel_sebastian;

-- 1. Campos nuevos de facturas -------------------------------------------
DROP PROCEDURE IF EXISTS sogo_agregar_columna;
DELIMITER //
CREATE PROCEDURE sogo_agregar_columna(IN tabla VARCHAR(64), IN columna VARCHAR(64), IN definicion VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tabla AND COLUMN_NAME = columna) THEN
    SET @sql = CONCAT('ALTER TABLE ', tabla, ' ADD COLUMN ', columna, ' ', definicion);
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
DELIMITER ;

CALL sogo_agregar_columna('facturas', 'datos_validados_at', 'DATETIME DEFAULT NULL');            -- validación de datos fiscales en SOGO
CALL sogo_agregar_columna('facturas', 'creado_por_nombre', 'VARCHAR(120) DEFAULT NULL');
CALL sogo_agregar_columna('facturas', 'emitida_por_nombre', 'VARCHAR(120) DEFAULT NULL');
CALL sogo_agregar_columna('facturas', 'anulada_por_nombre', 'VARCHAR(120) DEFAULT NULL');
CALL sogo_agregar_columna('facturas', 'actualizado_at', 'DATETIME DEFAULT NULL');
DROP PROCEDURE sogo_agregar_columna;

-- Un borrador puede guardarse antes de tener el comprador completo
ALTER TABLE facturas MODIFY tercero_id BIGINT NULL;

-- 2. Datos del hospedaje (solo si aún no existen) ---------------------------
INSERT IGNORE INTO configuracion (clave, valor) VALUES ('hospedaje', JSON_OBJECT(
  'commercialName', 'Hospedaje Sebastián Filandia',
  'legalName',      '',
  'nit',            '',
  'rnt',            '',
  'establishment',  'Vivienda turística',
  'address',        'Carrera 3ra #5-65',
  'municipality',   'Filandia, Quindío · Colombia',
  'phone',          '+57 311 340 8867',
  'mobile',         '+57 314 755 6717',
  'email',          'hospedajesebastianfilandia@gmail.com',
  'website',        '',
  'logo',           NULL,
  'currency',       'Peso colombiano (COP)',
  'timezone',       'America/Bogota (UTC-5)',
  'dateFormat',     'dd/mm/aaaa',
  'language',       'Español',
  'thousands',      'Punto · $ 1.234.567',
  'weekStart',      'Lunes'
));

-- 3. Configuración de facturación (solo si aún no existe) ------------------
-- Sin resolución ni proveedor: se completan en Facturación › Configuración
-- con los datos que entrega la DIAN y el proveedor tecnológico.
INSERT IGNORE INTO configuracion (clave, valor) VALUES ('facturacion', JSON_OBJECT(
  'provider', JSON_OBJECT('name', '', 'apiUrl', '', 'environment', 'Habilitación', 'clientId', '', 'apiKey', '', 'lastResponse', '', 'connected', FALSE),
  'resolution', JSON_OBJECT('number', '', 'prefix', 'FE', 'from', 1, 'to', 1000, 'validFrom', NULL, 'validTo', NULL, 'technicalKey', '', 'creditPrefix', 'NCE'),
  'taxes', JSON_ARRAY(
    JSON_OBJECT('id', 't1', 'concept', 'Alojamiento', 'kind', 'IVA', 'rate', 0.19, 'condition', 'General', 'status', 'Validar con contador'),
    JSON_OBJECT('id', 't2', 'concept', 'Alojamiento · extranjero no residente', 'kind', 'IVA', 'rate', 0, 'condition', 'Pasaporte y sin residencia en Colombia', 'status', 'Validar con contador'),
    JSON_OBJECT('id', 't3', 'concept', 'Daños y faltantes', 'kind', 'IVA', 'rate', 0, 'condition', 'Reposición (indemnización), no es una venta', 'status', 'Validar con contador'),
    JSON_OBJECT('id', 't4', 'concept', 'Eventos y pasadías', 'kind', 'IVA', 'rate', 0.19, 'condition', 'General', 'status', 'Validar con contador'),
    JSON_OBJECT('id', 't5', 'concept', 'Lavandería', 'kind', 'IVA', 'rate', 0.19, 'condition', 'General', 'status', 'Validar con contador'),
    JSON_OBJECT('id', 't6', 'concept', 'Otro', 'kind', 'IVA', 'rate', 0.19, 'condition', 'General', 'status', 'Validar con contador')
  ),
  'automation', JSON_OBJECT('emailOnAccept', TRUE),
  'emailSubject', 'Factura electrónica {número} · {hospedaje}',
  'emailBody', 'Hola {huésped}, gracias por hospedarte con nosotros. Adjuntamos la factura electrónica {número} de tu estadía del {fechas}, por {total}. Cualquier inquietud, responde a este correo.'
));

-- 4. Verificación -----------------------------------------------------------
SELECT clave, JSON_UNQUOTE(JSON_EXTRACT(valor, '$.commercialName')) AS hospedaje FROM configuracion WHERE clave IN ('hospedaje', 'facturacion');
SELECT COUNT(*) AS facturas FROM facturas;
