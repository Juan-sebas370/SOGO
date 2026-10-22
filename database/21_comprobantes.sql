-- =====================================================================
-- Comprobantes contables con el formato del contador
--
--  · centros_costo: CC-01 Alojamiento, CC-02 Restaurante y cafetería,
--    CC-03 Administración (se pueden agregar más en SOGO).
--  · asiento_lineas: centro de costo e identificación del tercero (NIT/CC)
--    de cada línea.
--  · asientos: identificación del tercero, factura que afecta y motivo
--    (notas crédito y débito).
--  · Datos del emisor que salen en cada comprobante (propietario, NIT,
--    dirección, teléfono): configuracion 'contabilidad' → emisor.
--  · Numeración (la asigna el servidor): NCO nota de contabilidad, RC recibo
--    de caja, CE comprobante de egreso, NC nota crédito, ND nota débito,
--    con el año y el consecutivo: RC-2026001. Los comprobantes ya
--    registrados conservan su número.
--
-- Solo AGREGA columnas, tablas y filas: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 20.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

CREATE TABLE IF NOT EXISTS centros_costo (
  codigo  VARCHAR(10)  NOT NULL,
  nombre  VARCHAR(80)  NOT NULL,
  activo  TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO centros_costo (codigo, nombre) VALUES
  ('CC-01', 'Alojamiento'),
  ('CC-02', 'Restaurante y cafetería'),
  ('CC-03', 'Administración');

ALTER TABLE asiento_lineas
  ADD COLUMN centro_costo        VARCHAR(10) DEFAULT NULL,
  ADD COLUMN tercero_documento   VARCHAR(30) DEFAULT NULL;

ALTER TABLE asientos
  ADD COLUMN tercero_documento   VARCHAR(30) DEFAULT NULL,
  ADD COLUMN factura_afecta      VARCHAR(40) DEFAULT NULL,
  ADD COLUMN motivo_nota         VARCHAR(30) DEFAULT NULL;   -- Error | Devolución | Rebaja | Anulación (NC) / cobro adicional (ND)

-- Las líneas ya registradas toman el centro de costo según su origen
UPDATE asiento_lineas l JOIN asientos a ON a.id = l.asiento_id
   SET l.centro_costo = CASE WHEN a.origen IN ('Reservas', 'Alojamiento', 'Facturación') THEN 'CC-01' ELSE 'CC-03' END
 WHERE l.centro_costo IS NULL;

-- Datos del emisor en los comprobantes
UPDATE configuracion SET valor = JSON_SET(valor, '$.emisor', JSON_OBJECT(
    'nombre', 'Hospedaje Sebastián',
    'propietario', 'Guillermo Pinilla Hurtado',
    'nit', '7.511.827-2',
    'direccion', 'Cra 3 # 5-65, piso 2 · Filandia, Quindío',
    'telefono', '311 340 8867'))
 WHERE clave = 'contabilidad' AND JSON_EXTRACT(valor, '$.emisor') IS NULL;

-- Cuenta de la comisión de Booking (en el plan de la hoja: 233520 Comisiones)
UPDATE cuentas_puc SET nombre = 'Comisiones por pagar' WHERE codigo = '233520';

-- ── Comprobación ────────────────────────────────────────────────────
SELECT * FROM centros_costo;
SELECT centro_costo, COUNT(*) AS lineas FROM asiento_lineas GROUP BY centro_costo;
SELECT JSON_EXTRACT(valor, '$.emisor') AS emisor FROM configuracion WHERE clave = 'contabilidad';
