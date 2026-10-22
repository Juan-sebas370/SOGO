-- =====================================================================
-- Bancos: la cuenta es 1110 (no la subcuenta 111005)
--
--  · Crea la cuenta 1110 Bancos en el plan de cuentas.
--  · Pasa a 1110 las líneas de comprobantes que ya estaban en 111005
--    (no cambia ningún valor ni número de comprobante).
--  · Quita la cuenta 111005, que queda sin uso.
--
-- Solo toca tablas de Contabilidad: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 14.
-- Se puede volver a ejecutar sin problema.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

INSERT IGNORE INTO cuentas_puc (codigo, nombre, clase, corriente, contraria, activa) VALUES
  ('1110', 'Bancos', 'Activo', 1, 0, 1);
UPDATE cuentas_puc SET nombre = 'Bancos', clase = 'Activo', corriente = 1, contraria = 0, activa = 1 WHERE codigo = '1110';

UPDATE asiento_lineas SET cuenta_codigo = '1110' WHERE cuenta_codigo = '111005';
DELETE FROM cuentas_puc WHERE codigo = '111005';

-- ── Comprobación ────────────────────────────────────────────────────
SELECT codigo, nombre, clase, activa FROM cuentas_puc WHERE codigo IN ('1110', '111005');
SELECT cuenta_codigo, COUNT(*) AS lineas FROM asiento_lineas WHERE cuenta_codigo IN ('1110', '111005') GROUP BY cuenta_codigo;
