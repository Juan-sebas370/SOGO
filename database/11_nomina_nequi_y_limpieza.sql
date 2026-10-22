-- =====================================================================
-- Nómina: datos reales, pago por Nequi y constancia de recibido
--
-- 1. Quita los datos inventados que quedaron de la demostración en las
--    fichas de Andrés, Valentina y Diana (cuentas Bancolombia, EPS, fondos,
--    direcciones, fechas de nacimiento, salario e ingreso de 2023, préstamo).
--    Los 6 empleados quedan con lo que sí es real (nombre, documento, correo,
--    teléfono y cargo de Usuarios) y lo demás "por completar" en Nómina.
-- 2. El medio de pago de todos es Nequi (el número se registra en la ficha).
-- 3. Tabla nomina_pagos: un pago por empleado y nómina, con la referencia de
--    la transferencia Nequi y la firma de recibido del empleado.
--
-- Solo AGREGA una tabla y cambia datos de empleados: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 10.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── 0. Copia de seguridad de lo que se cambia ───────────────────────
CREATE TABLE IF NOT EXISTS respaldo_11_empleados   AS SELECT * FROM empleados;
CREATE TABLE IF NOT EXISTS respaldo_11_salarios    AS SELECT * FROM empleado_salarios;
CREATE TABLE IF NOT EXISTS respaldo_11_deducciones AS SELECT * FROM empleado_deducciones;

-- ── 1. Pago de cada empleado en cada nómina ─────────────────────────
CREATE TABLE IF NOT EXISTS nomina_pagos (
  id               BIGINT        NOT NULL AUTO_INCREMENT,
  nomina_id        BIGINT        NOT NULL,
  empleado_id      BIGINT        NOT NULL,
  medio            VARCHAR(20)   NOT NULL DEFAULT 'Nequi',
  cuenta_destino   VARCHAR(30)   NOT NULL,              -- celular Nequi del empleado
  valor            DECIMAL(14,2) NOT NULL,              -- neto transferido
  referencia       VARCHAR(40)   NOT NULL,              -- n.º de la transacción Nequi
  pagado_at        DATETIME      NOT NULL,
  pagado_por       BIGINT        DEFAULT NULL,
  recibido_at      DATETIME      DEFAULT NULL,          -- firma de recibido del empleado
  recibido_nombre  VARCHAR(160)  DEFAULT NULL,
  firma            MEDIUMTEXT    DEFAULT NULL,          -- imagen de la firma (PNG en base64)
  PRIMARY KEY (id),
  UNIQUE KEY uk_nomina_pagos (nomina_id, empleado_id),
  UNIQUE KEY uk_nomina_pagos_ref (medio, referencia),
  CONSTRAINT fk_nomina_pagos_nomina   FOREIGN KEY (nomina_id)   REFERENCES nominas (id) ON DELETE CASCADE,
  CONSTRAINT fk_nomina_pagos_empleado FOREIGN KEY (empleado_id) REFERENCES empleados (id),
  CONSTRAINT fk_nomina_pagos_usuario  FOREIGN KEY (pagado_por)  REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

START TRANSACTION;

-- ── 2. Datos inventados de la demostración ──────────────────────────
-- Seguridad social, dirección y nacimiento: por completar con los datos reales
UPDATE empleados
   SET fecha_nacimiento = NULL, direccion = '', eps = '', fondo_pension = '', arl = '', caja_compensacion = '',
       riesgo_arl = 'I', tipo_contrato = 'Término indefinido', fin_contrato = NULL, datos_bancarios = NULL,
       fecha_modificacion = NOW()
 WHERE clave IN ('e2', 'e3', 'e5');

-- Salario e ingreso inventados: quedan igual que los demás (por confirmar)
DELETE s FROM empleado_salarios s JOIN empleados e ON e.id = s.empleado_id WHERE e.clave IN ('e2', 'e3', 'e5');
UPDATE empleados SET fecha_contratacion = '2026-10-01', salario = 1750905 WHERE clave IN ('e2', 'e3', 'e5');
INSERT INTO empleado_salarios (empleado_id, desde, monto)
SELECT id, '2026-10-01', 1750905 FROM empleados WHERE clave IN ('e2', 'e3', 'e5');

-- Préstamo de demostración
DELETE d FROM empleado_deducciones d JOIN empleados e ON e.id = d.empleado_id WHERE e.clave IN ('e2', 'e3', 'e5');

-- Teléfono: el mismo de su cuenta en Usuarios
UPDATE empleados e JOIN usuarios u ON u.id = e.usuario_id
   SET e.telefono = u.telefono
 WHERE u.telefono IS NOT NULL AND u.telefono <> '';

-- Historial limpio (los cambios de la demostración no ocurrieron)
UPDATE empleados
   SET sogo_datos = JSON_OBJECT('history', JSON_ARRAY(JSON_OBJECT(
         'at', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i'), 'by', 'Juan Sebastián Pinilla',
         'text', 'Ficha depurada: se quitaron los datos de demostración · completar salario, ingreso, seguridad social y Nequi')))
 WHERE clave IN ('e-w1', 'e-u5', 'e2', 'e5', 'e3', 'e-u11');

-- Novedades de demostración en la nómina en borrador (horas extra y bonificaciones
-- que nadie reportó): el borrador queda sin novedades para registrar las reales
UPDATE nominas SET datos = JSON_SET(datos, '$.novelties', JSON_OBJECT()) WHERE estado = 'Borrador';
DELETE nn FROM nomina_novedades nn JOIN nominas n ON n.id = nn.nomina_id WHERE n.estado = 'Borrador';

-- ── 3. Medio de pago: Nequi ─────────────────────────────────────────
-- El número Nequi (celular) se registra en la ficha; las cuentas de demostración se borran
UPDATE empleados SET banco = 'Nequi', tipo_cuenta = 'Nequi', numero_cuenta = NULL;

COMMIT;

-- ── Comprobación ────────────────────────────────────────────────────
SELECT numero_empleado AS codigo, CONCAT(nombre, ' ', apellido) AS empleado, cargo, estado, fecha_contratacion AS ingreso,
       salario, banco AS medio_pago, COALESCE(numero_cuenta, 'por registrar') AS numero_nequi, telefono
FROM empleados ORDER BY numero_empleado;
SELECT COUNT(*) AS deducciones FROM empleado_deducciones;
SHOW TABLES LIKE 'nomina_pagos';
