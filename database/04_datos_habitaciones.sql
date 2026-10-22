-- =====================================================================
-- Datos físicos de las 7 habitaciones (camas y baño), tomados del
-- catálogo de la casa de SOGO (frontend/src/app/lodging/house.ts).
-- La columna tipo_bano se creó con 'Privado' por defecto, así que hoy
-- TODAS aparecen con baño privado. NO cambia precios ni descripciones
-- (esos los muestra la página web). Se puede ejecutar más de una vez.
-- =====================================================================
USE hotel_sebastian;
SET SQL_SAFE_UPDATES = 0;

UPDATE habitaciones h
JOIN (
  SELECT '101' AS numero, 'Familiar' AS tipo, 4 AS capacidad, '1 cama doble, 1 camarote' AS camas, 'Privado' AS tipo_bano, NULL AS comparte UNION ALL
  SELECT '102', 'Doble',    2, '1 cama doble',             'Compartido', '103' UNION ALL
  SELECT '103', 'Doble',    2, '1 cama doble',             'Compartido', '102' UNION ALL
  SELECT '201', 'Familiar', 4, '1 cama doble, 1 camarote', 'Privado',    NULL  UNION ALL
  SELECT '202', 'Doble',    2, '1 cama doble',             'Compartido', '203' UNION ALL
  SELECT '203', 'Doble',    2, '1 cama doble',             'Compartido', '202' UNION ALL
  SELECT '204', 'Familiar', 4, '1 cama doble, 1 camarote', 'Privado',    NULL
) d ON d.numero = h.numero
SET h.camas             = d.camas,
    h.tipo_bano         = d.tipo_bano,
    h.comparte_bano_con = d.comparte,
    h.bano              = (d.tipo_bano = 'Privado'),
    h.tipo              = COALESCE(NULLIF(h.tipo, ''), d.tipo),
    h.capacidad         = COALESCE(h.capacidad, d.capacidad);

SET SQL_SAFE_UPDATES = 1;

-- Verificación
SELECT numero, piso, tipo, capacidad, camas, tipo_bano, comparte_bano_con, precio_noche, estado
FROM habitaciones ORDER BY numero;



