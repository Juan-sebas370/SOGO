-- =====================================================================
-- Corrige las reservas hechas desde la página web.
-- La página (components/reservas/reservas.ts) usa una lista fija de
-- habitaciones con ids 1..7 que NO son los ids reales de la tabla
-- `habitaciones`. Aquí se traducen por NÚMERO de habitación:
--   1→101  2→102  3→103  4→201  5→202  6→203  7→204
-- Ejecuta por partes (selecciona cada bloque y pulsa el rayo).
-- =====================================================================
USE hotel_sebastian;

-- ---------------------------------------------------------------------
-- PARTE 1 — Revisión. Las 7 filas deben tener id_real (no NULL).
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS mapa_web;
CREATE TEMPORARY TABLE mapa_web (id_web BIGINT PRIMARY KEY, numero VARCHAR(10));
INSERT INTO mapa_web VALUES (1,'101'),(2,'102'),(3,'103'),(4,'201'),(5,'202'),(6,'203'),(7,'204');

SELECT m.id_web, m.numero, h.id AS id_real
FROM mapa_web m LEFT JOIN habitaciones h ON h.numero = m.numero
ORDER BY m.id_web;

-- ---------------------------------------------------------------------
-- PARTE 2 — Corrección (solo si la PARTE 1 salió completa).
-- Solo toca ids que hoy apuntan a habitaciones inexistentes, así que
-- ejecutarla dos veces no hace daño.
-- ---------------------------------------------------------------------
SET SQL_SAFE_UPDATES = 0;
START TRANSACTION;

UPDATE reservas r
JOIN mapa_web m     ON m.id_web = r.habitacion_id
JOIN habitaciones h ON h.numero = m.numero
LEFT JOIN habitaciones actual ON actual.id = r.habitacion_id
SET r.habitacion_id = h.id
WHERE actual.id IS NULL;

UPDATE reserva_habitaciones rh
JOIN mapa_web m     ON m.id_web = rh.habitacion_id
JOIN habitaciones h ON h.numero = m.numero
LEFT JOIN habitaciones actual ON actual.id = rh.habitacion_id
SET rh.habitacion_id = h.id
WHERE actual.id IS NULL;

-- Huésped principal: completar la habitación que quedó vacía
UPDATE reserva_huespedes rhu
JOIN reservas r ON r.id = rhu.reserva_id
SET rhu.habitacion_id = r.habitacion_id
WHERE rhu.habitacion_id IS NULL AND rhu.rol = 'PRINCIPAL';

COMMIT;
SET SQL_SAFE_UPDATES = 1;

-- ---------------------------------------------------------------------
-- PARTE 3 — Verificación: debe devolver 0 filas.
-- ---------------------------------------------------------------------
SELECT 'reservas' AS tabla, r.id AS reserva, r.habitacion_id
FROM reservas r LEFT JOIN habitaciones h ON h.id = r.habitacion_id
WHERE r.habitacion_id IS NOT NULL AND h.id IS NULL
UNION ALL
SELECT 'reserva_habitaciones', rh.reserva_id, rh.habitacion_id
FROM reserva_habitaciones rh LEFT JOIN habitaciones h ON h.id = rh.habitacion_id
WHERE rh.habitacion_id IS NOT NULL AND h.id IS NULL;

-- Cómo quedaron (número de habitación real de cada reserva)
SELECT r.id, r.codigo, r.nombre_huesped, h.numero AS habitacion
FROM reservas r LEFT JOIN habitaciones h ON h.id = r.habitacion_id
ORDER BY r.id;
