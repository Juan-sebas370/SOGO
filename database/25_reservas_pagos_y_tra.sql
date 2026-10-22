-- =====================================================================
-- 25 · Cobro y estado de las reservas + TRA guardada en la base de datos
--   · Políticas de reserva (configuracion 'politicas_reserva'): abono para
--     confirmar, horas de check-in/out, cancelación y pasadías. Antes vivían
--     solo en memoria. Se cargan los valores que SOGO mostraba; se cambian en
--     Configuración › Alojamiento y reservas.
--   · TRA: cada tarjeta (huésped principal, acompañantes, unidades, envíos e
--     historial) se guarda en tra_registros.datos. Antes se perdía al recargar.
-- Solo agrega: no borra ni cambia datos. Se puede ejecutar dos veces.
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

CALL sogo_agregar_columna('tra_registros', 'datos', 'JSON DEFAULT NULL');                         -- la TRA completa
CALL sogo_agregar_columna('tra_registros', 'actualizado_por_nombre', 'VARCHAR(120) DEFAULT NULL');
DROP PROCEDURE sogo_agregar_columna;

-- Políticas de reserva (solo si aún no existen)
INSERT IGNORE INTO configuracion (clave, valor) VALUES ('politicas_reserva', JSON_OBJECT(
  'checkIn', '15:00', 'checkOut', '12:00', 'depositPct', 50, 'freeCancelHours', 72,
  'latePenalty', 'Primera noche', 'dayPassMax', 20, 'requireTra', TRUE
));

-- Verificación
SELECT JSON_EXTRACT(valor, '$.depositPct') AS abono_para_confirmar_pct FROM configuracion WHERE clave = 'politicas_reserva';
SELECT COUNT(*) AS tra_guardadas FROM tra_registros WHERE datos IS NOT NULL;
