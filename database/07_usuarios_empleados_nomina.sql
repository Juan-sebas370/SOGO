-- =====================================================================
-- Usuarios, roles, auditoría, empleados y nómina de SOGO en la base de
-- datos (antes vivían en memoria y se reiniciaban al recargar).
--
-- `clave` = identificador estable que usa la aplicación (u…, e…, admin,
-- recep…). Los datos propios de SOGO sin columna dedicada (historial de
-- cambios, desactivación programada…) van en `sogo_datos` (JSON).
-- Solo se AGREGAN columnas opcionales: la página web sigue igual.
--
-- Ejecutar una vez, completo (rayo sin seleccionar nada).
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── Usuarios ────────────────────────────────────────────────────────
ALTER TABLE usuarios
  ADD COLUMN clave      VARCHAR(40) DEFAULT NULL,
  ADD COLUMN sogo_datos JSON        DEFAULT NULL,
  ADD UNIQUE KEY uk_usuarios_clave (clave);

-- Prefijo w (filas creadas por la web o antes de SOGO): no choca con las claves u… de SOGO
UPDATE usuarios SET clave = CONCAT('w', id) WHERE clave IS NULL;

-- ── Roles ───────────────────────────────────────────────────────────
ALTER TABLE roles
  ADD COLUMN clave VARCHAR(40) DEFAULT NULL,
  ADD UNIQUE KEY uk_roles_clave (clave);

UPDATE roles SET clave = CASE nombre
    WHEN 'Administrador'            THEN 'admin'
    WHEN 'Consulta'                 THEN 'consulta'
    WHEN 'Recepcionista'            THEN 'recep'
    WHEN 'Operador Restaurante'     THEN 'rest'
    WHEN 'Operador Alojamiento'     THEN 'aloj'
    WHEN 'Contador'                 THEN 'cont'
    WHEN 'Aux. Nómina e Inventario' THEN 'aux'
    ELSE CONCAT('r', id) END
WHERE clave IS NULL;

-- ── Historial de estados, restablecimientos y exportaciones ─────────
CREATE TABLE IF NOT EXISTS usuario_eventos (
  id     BIGINT      NOT NULL AUTO_INCREMENT,
  tipo   VARCHAR(20) NOT NULL,            -- estado | clave | exportacion
  fecha  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  datos  JSON        NOT NULL,
  PRIMARY KEY (id),
  KEY idx_usuario_eventos (tipo, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Empleados ───────────────────────────────────────────────────────
-- (la tabla es de la web: solo se amplía; el correo pasa a ser opcional)
ALTER TABLE empleados
  ADD COLUMN clave      VARCHAR(40) DEFAULT NULL,
  ADD COLUMN sogo_datos JSON        DEFAULT NULL,
  MODIFY COLUMN tipo_documento VARCHAR(60) DEFAULT NULL,
  MODIFY COLUMN email VARCHAR(120) NULL,
  ADD UNIQUE KEY uk_empleados_clave (clave);

UPDATE empleados SET clave = CONCAT('x', id) WHERE clave IS NULL;

ALTER TABLE empleado_deducciones
  ADD COLUMN clave VARCHAR(40) DEFAULT NULL;

-- ── Nóminas ─────────────────────────────────────────────────────────
-- Cada corrida guarda su detalle (novedades, liquidaciones, comprobantes) en `datos`
ALTER TABLE nominas
  ADD COLUMN clave VARCHAR(40) DEFAULT NULL,
  ADD COLUMN datos JSON        DEFAULT NULL,
  ADD UNIQUE KEY uk_nominas_clave (clave);

SET SQL_SAFE_UPDATES = 1;

-- Verificación
SELECT 'usuarios' AS tabla, COUNT(*) AS filas, SUM(clave IS NULL) AS sin_clave FROM usuarios
UNION ALL SELECT 'roles', COUNT(*), SUM(clave IS NULL) FROM roles
UNION ALL SELECT 'empleados', COUNT(*), SUM(clave IS NULL) FROM empleados;
