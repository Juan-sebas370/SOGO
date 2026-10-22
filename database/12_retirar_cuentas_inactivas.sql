-- =====================================================================
-- Nómina al día con Usuarios: una cuenta Inactiva = persona que ya no trabaja
--
-- Para cada empleado cuya cuenta de Usuarios está Inactiva, se toma la última
-- desactivación registrada (fecha y motivo en usuario_eventos):
--   · Retiro voluntario / Terminación de contrato / Otro → Retirado desde esa fecha
--   · Vacaciones o licencia → Vacaciones (sigue en la nómina)
--   · Cambio de funciones / Seguridad → sigue Activo (solo pierde el acceso a SOGO)
-- Desde ahora el servidor lo hace solo cada vez que se desactiva una cuenta.
--
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 11.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

CREATE TABLE IF NOT EXISTS respaldo_12_empleados AS SELECT * FROM empleados;

-- Última desactivación de cada cuenta
DROP TEMPORARY TABLE IF EXISTS ult_desactivacion;
CREATE TEMPORARY TABLE ult_desactivacion AS
SELECT JSON_UNQUOTE(JSON_EXTRACT(ev.datos, '$.username')) AS username,
       JSON_UNQUOTE(JSON_EXTRACT(ev.datos, '$.reason'))   AS motivo,
       DATE(ev.fecha)                                     AS fecha
FROM usuario_eventos ev
JOIN (SELECT JSON_UNQUOTE(JSON_EXTRACT(datos, '$.username')) AS username, MAX(id) AS id
      FROM usuario_eventos WHERE tipo = 'estado' GROUP BY JSON_UNQUOTE(JSON_EXTRACT(datos, '$.username'))) ult ON ult.id = ev.id
WHERE JSON_UNQUOTE(JSON_EXTRACT(ev.datos, '$.to')) = 'Inactivo';

START TRANSACTION;

-- Retirados (exempleados)
UPDATE empleados e
JOIN usuarios u ON u.id = e.usuario_id
JOIN ult_desactivacion d ON d.username = COALESCE(u.username, u.email)
SET e.estado = 'Retirado',
    e.activo = 0,
    e.fecha_terminacion = IF(e.fecha_contratacion > d.fecha, DATE_SUB(e.fecha_contratacion, INTERVAL 1 DAY), d.fecha),
    e.fecha_modificacion = NOW(),
    e.sogo_datos = JSON_ARRAY_INSERT(
      JSON_SET(COALESCE(e.sogo_datos, JSON_OBJECT('history', JSON_ARRAY())), '$.retirementReason',
        CASE WHEN d.motivo LIKE 'Retiro voluntario%' OR d.motivo LIKE 'Renuncia%' THEN 'Renuncia voluntaria'
             WHEN d.motivo LIKE 'Terminaci%' THEN 'Terminación del contrato'
             ELSE 'Otro' END),
      '$.history[0]',
      JSON_OBJECT('at', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i'), 'by', 'Juan Sebastián Pinilla',
        'text', CONCAT('Retiro · ', DATE_FORMAT(d.fecha, '%d/%m/%Y'), ' (cuenta desactivada en Usuarios: ', d.motivo, ')')))
WHERE u.estado = 'Inactivo' AND e.estado <> 'Retirado'
  AND d.motivo NOT LIKE 'Vacaciones%' AND d.motivo NOT LIKE 'Cambio de funciones%' AND d.motivo NOT LIKE 'Seguridad%';

-- De vacaciones o licencia
UPDATE empleados e
JOIN usuarios u ON u.id = e.usuario_id
JOIN ult_desactivacion d ON d.username = COALESCE(u.username, u.email)
SET e.estado = 'Vacaciones', e.fecha_modificacion = NOW()
WHERE u.estado = 'Inactivo' AND e.estado = 'Activo' AND d.motivo LIKE 'Vacaciones%';

COMMIT;
DROP TEMPORARY TABLE IF EXISTS ult_desactivacion;

-- ── Comprobación: Activos/Vacaciones = cuentas que siguen trabajando ──
SELECT e.numero_empleado AS codigo, CONCAT(e.nombre, ' ', e.apellido) AS empleado, e.estado AS en_nomina,
       e.fecha_terminacion AS retiro, JSON_UNQUOTE(JSON_EXTRACT(e.sogo_datos, '$.retirementReason')) AS motivo,
       u.estado AS cuenta
FROM empleados e LEFT JOIN usuarios u ON u.id = e.usuario_id
ORDER BY e.estado, e.numero_empleado;
