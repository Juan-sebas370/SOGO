-- =====================================================================
-- 24 · Documentos soporte de Contabilidad guardados en la base de datos
--   Hasta ahora `asiento_soportes` solo guardaba el nombre del archivo.
--   Desde este script guarda también el archivo (PDF o imagen, máx. 5 MB):
--   se abre desde Contabilidad › Comprobantes › detalle del comprobante.
--   Las filas sin archivo (referencias que pone la integración, p. ej.
--   "Recibo 123" o "FE-1.pdf") siguen igual.
-- Solo agrega columnas: no borra ni cambia datos. Se puede ejecutar dos veces.
-- =====================================================================
USE hotel_sebastian;

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

CALL sogo_agregar_columna('asiento_soportes', 'tipo_mime', 'VARCHAR(100) DEFAULT NULL');      -- application/pdf, image/jpeg...
CALL sogo_agregar_columna('asiento_soportes', 'tamano', 'INT DEFAULT NULL');                  -- bytes
CALL sogo_agregar_columna('asiento_soportes', 'contenido', 'LONGBLOB DEFAULT NULL');          -- el archivo
CALL sogo_agregar_columna('asiento_soportes', 'subido_por_nombre', 'VARCHAR(120) DEFAULT NULL');
DROP PROCEDURE sogo_agregar_columna;

-- Verificación: soportes con archivo y solo con nombre
SELECT COUNT(*) AS soportes, SUM(contenido IS NOT NULL) AS con_archivo, SUM(contenido IS NULL) AS solo_nombre FROM asiento_soportes;
