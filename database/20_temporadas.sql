-- =====================================================================
-- Calendario de temporadas en la base de datos (configuracion 'temporadas')
--
-- Lo gestiona SOGO en Alojamiento › Tarifas y temporadas y lo leen la página
-- web (reservador y servidor) y Reservas de SOGO. Antes estaba fijo en el
-- código de la web. Reglas iniciales (las mismas de antes):
--   · Alta: 15 dic – 15 ene, 15 jun – 15 jul y Semana Santa.
--   · Media: fines de semana y festivos.
--   · Baja: el resto.
-- Cambio: los festivos ahora son los de Colombia completos de 2026 y 2027
-- (antes solo 6 fechas fijas; faltaban los lunes festivos). Se agregan más
-- años desde SOGO con el botón «+ Festivos de Colombia».
--
-- Solo agrega una fila en configuracion: la web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 19.
-- Si ya existe (se guardó desde SOGO), no la cambia.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;

INSERT IGNORE INTO configuracion (clave, valor) VALUES ('temporadas', JSON_OBJECT(
  'alta', JSON_ARRAY(
    JSON_OBJECT('nombre', 'Fin y comienzo de año', 'desde', '12-15', 'hasta', '01-15'),
    JSON_OBJECT('nombre', 'Vacaciones de mitad de año', 'desde', '06-15', 'hasta', '07-15')),
  'media', JSON_ARRAY(),
  'semanaSanta', TRUE,
  'finesDeSemana', TRUE,
  'festivosMedia', TRUE,
  'festivos', JSON_ARRAY(
    '2026-01-01','2026-01-12','2026-03-23','2026-04-02','2026-04-03','2026-05-01','2026-05-18','2026-06-08','2026-06-15',
    '2026-06-29','2026-07-20','2026-08-07','2026-08-17','2026-10-12','2026-11-02','2026-11-16','2026-12-08','2026-12-25',
    '2027-01-01','2027-01-11','2027-03-22','2027-03-25','2027-03-26','2027-05-01','2027-05-10','2027-05-31','2027-06-07',
    '2027-07-05','2027-07-20','2027-08-07','2027-08-16','2027-10-18','2027-11-01','2027-11-15','2027-12-08','2027-12-25'),
  'especiales', JSON_ARRAY()
));

-- Comprobación
SELECT JSON_LENGTH(valor, '$.festivos') AS festivos, JSON_EXTRACT(valor, '$.alta') AS alta FROM configuracion WHERE clave = 'temporadas';
