-- =====================================================================
-- Nómina organizada en la base de datos
--
--  · parametros_nomina: SMMLV, auxilio y recargos por año (antes estaban
--    fijos en la aplicación). Se agregan estado y quién/cuándo los cambió.
--  · configuracion 'nomina_tasas': porcentajes de seguridad social y
--    prestaciones (salud, pensión, caja, ARL, cesantías, prima...).
--  · nominas: totales del período (devengado, deducciones, neto, número
--    de empleados) para consultarlos con SQL sin abrir el JSON.
--  · nomina_novedades, nomina_liquidaciones y comprobantes_pago (ya
--    existían vacías) las llena el servidor de SOGO automáticamente cada
--    vez que se guarda una nómina; al iniciar, completa las que falten.
--
-- Solo se AGREGAN columnas opcionales: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 07.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── Parámetros legales por año ──────────────────────────────────────
ALTER TABLE parametros_nomina
  ADD COLUMN estado          VARCHAR(10)  NOT NULL DEFAULT 'Vigente',   -- Cerrado | Vigente | Borrador
  ADD COLUMN actualizado_at  DATETIME     DEFAULT NULL,
  ADD COLUMN actualizado_por VARCHAR(120) DEFAULT NULL;

-- Años anteriores al actual quedan cerrados (lo liquidado con ellos no cambia)
UPDATE parametros_nomina SET estado = 'Cerrado' WHERE anio < YEAR(CURDATE());
UPDATE parametros_nomina SET actualizado_at = NOW(), actualizado_por = 'administrador' WHERE actualizado_at IS NULL;

-- Si faltara algún año (el 02 ya los crea), se agregan los valores de ley
INSERT IGNORE INTO parametros_nomina (anio, smmlv, auxilio_transporte, jornada_semanal, reglas, estado, actualizado_at, actualizado_por) VALUES
  (2025, 1423500, 200000, 44, JSON_OBJECT('extraDay', 0.25, 'extraNight', 0.75, 'nightSurcharge', 0.35), 'Cerrado', NOW(), 'administrador'),
  (2026, 1750905, 249095, 42, JSON_OBJECT('extraDay', 0.25, 'extraNight', 0.75, 'nightSurcharge', 0.35), 'Vigente', NOW(), 'administrador');

-- ── Porcentajes de ley (seguridad social y prestaciones) ────────────
INSERT IGNORE INTO configuracion (clave, valor) VALUES ('nomina_tasas', JSON_OBJECT(
  'employee',  JSON_OBJECT('health', 0.04, 'pension', 0.04, 'solidarity', 0.01),
  'employer',  JSON_OBJECT('pension', 0.12, 'ccf', 0.04),
  'arl',       JSON_OBJECT('I', 0.00522, 'II', 0.01044, 'III', 0.02436, 'IV', 0.0435, 'V', 0.0696),
  'provision', JSON_OBJECT('cesantias', 0.0833, 'intereses', 0.01, 'prima', 0.0833, 'vacaciones', 0.0417)
));

-- ── Totales de cada nómina ──────────────────────────────────────────
ALTER TABLE nominas
  ADD COLUMN num_empleados     INT           DEFAULT NULL,
  ADD COLUMN total_devengado   DECIMAL(14,2) DEFAULT NULL,
  ADD COLUMN total_deducciones DECIMAL(14,2) DEFAULT NULL,
  ADD COLUMN total_neto        DECIMAL(14,2) DEFAULT NULL;

-- ── Comprobación ────────────────────────────────────────────────────
SELECT anio, smmlv, auxilio_transporte, estado FROM parametros_nomina ORDER BY anio;
SELECT clave FROM configuracion WHERE clave = 'nomina_tasas';
