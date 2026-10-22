-- =====================================================================
-- Contabilidad en la base de datos
--
--  · asientos / asiento_lineas / asiento_soportes (ya existían vacías, del
--    script 01) pasan a guardar TODOS los comprobantes: los manuales y los
--    que SOGO integra solo desde Reservas, Alojamiento, Nómina e Inventarios.
--    El número (CI-2026-0001...) lo asigna el servidor con `consecutivos`.
--  · asientos: quién creó / anuló (nombre) y cuándo se actualizó.
--  · contabilidad_eventos: historial de integraciones y exportaciones.
--  · configuracion 'contabilidad': fecha de inicio de la contabilidad en
--    SOGO, meses cerrados y cuenta de ingreso de cada categoría de consumo.
--  · Plan de cuentas: se quita el nombre inventado del crédito y se dejan
--    inactivas las cuentas de restaurante (el hospedaje no vende comida).
--
-- NO trae saldos ni movimientos inventados: los saldos iniciales reales se
-- registran en SOGO (Contabilidad › Nuevo movimiento › Saldos iniciales).
-- Solo AGREGA columnas y filas: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 13.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── Asientos: nombres de quién creó y anuló ─────────────────────────
ALTER TABLE asientos
  ADD COLUMN usuario_nombre      VARCHAR(160) DEFAULT NULL,
  ADD COLUMN anulado_por_nombre  VARCHAR(160) DEFAULT NULL,
  ADD COLUMN actualizado_at      DATETIME     DEFAULT NULL;

-- ── Historial de integraciones y exportaciones ──────────────────────
CREATE TABLE IF NOT EXISTS contabilidad_eventos (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  tipo            VARCHAR(20)  NOT NULL,              -- Integración | Exportación
  modo            VARCHAR(20)  DEFAULT NULL,          -- Manual | Automática (integraciones)
  creado_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id      BIGINT       DEFAULT NULL,
  usuario_nombre  VARCHAR(160) DEFAULT NULL,
  detalle         JSON         NOT NULL,
  PRIMARY KEY (id),
  KEY idx_cont_eventos_tipo (tipo, creado_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Ajustes contables ───────────────────────────────────────────────
-- inicio: desde esa fecha SOGO integra los módulos (lo anterior entra con
-- los saldos iniciales). Se puede cambiar en Contabilidad › Integración.
INSERT IGNORE INTO configuracion (clave, valor) VALUES ('contabilidad', JSON_OBJECT(
  'inicio', '2026-09-01',
  'cerradoHasta', NULL,
  'mapping', JSON_OBJECT('Alojamiento', '415505', 'Eventos y pasadías', '415510', 'Lavandería', '415520', 'Minibar', '415520',
                         'Daños y faltantes', '425035', 'Otro', '415520')
));

-- ── Plan de cuentas ─────────────────────────────────────────────────
UPDATE cuentas_puc SET nombre = 'Obligaciones financieras' WHERE codigo = '210505';
UPDATE cuentas_puc SET activa = 0 WHERE codigo IN ('415515', '613505');
INSERT IGNORE INTO cuentas_puc (codigo, nombre, clase, corriente, contraria) VALUES
  ('519530', 'Útiles y papelería', 'Gasto', 0, 0),
  ('539520', 'Pérdidas y bajas de inventario', 'Gasto', 0, 0),
  ('425050', 'Recuperaciones y donaciones de inventario', 'Ingreso', 0, 0),
  ('425035', 'Reintegro por daños y faltantes', 'Ingreso', 0, 0);

-- ── Comprobación ────────────────────────────────────────────────────
SELECT clase, COUNT(*) AS cuentas, SUM(activa) AS activas FROM cuentas_puc GROUP BY clase;
SELECT COUNT(*) AS asientos FROM asientos;
SELECT valor FROM configuracion WHERE clave = 'contabilidad';
