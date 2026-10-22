-- =====================================================================
-- Alinear Nómina (empleados) con Usuarios
--
-- El personal real es el de Usuarios:
--   Juan Sebastián Pinilla (Administrador), Mónica Herrera Zuluaga (Contador),
--   Andrés Muñoz Giraldo (Auxiliar de Alojamiento), Valentina Quintero Mejía (Aux. Nómina
--   e Inventario), Diana Patricia Osorio (Auxiliar de Alojamiento), Daniela Ocampo Arias
--   (Auxiliar de Alojamiento).
--
-- Laura Castaño, Mariana Toro, Julián Ramírez, Carlos Arango y Samuel Gómez
-- eran datos de demostración: se quitan (empleado y cuenta inactiva). Las
-- nóminas de enero a octubre de 2026 también eran de demostración (liquidadas
-- con esas personas): se quitan. ANTES se guarda una COPIA en las tablas
-- respaldo_demo_* por si se necesitara consultarlas.
--
-- Cargo y área de cada empleado = el de su rol en Usuarios (no hay restaurante).
-- Juan Sebastián, Mónica y Daniela quedan como empleados nuevos con salario
-- mínimo e ingreso 01/10/2026: corrige en Nómina › Empleados su salario real,
-- fecha de ingreso, documento, EPS, pensión, banco, etc.
--
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 08.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── 0. Copia de seguridad ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS respaldo_demo_nominas   AS SELECT * FROM nominas;
CREATE TABLE IF NOT EXISTS respaldo_demo_empleados AS SELECT * FROM empleados;
CREATE TABLE IF NOT EXISTS respaldo_demo_usuarios  AS SELECT id, clave, username, email, nombre, apellido, cedula_identidad, cargo, estado FROM usuarios;

START TRANSACTION;

-- ── 1. Nóminas de demostración ──────────────────────────────────────
DELETE c FROM comprobantes_pago c JOIN nominas n ON n.id = c.nomina_id WHERE n.clave LIKE 'n2026-%';
DELETE FROM nominas WHERE clave LIKE 'n2026-%';      -- novedades y liquidaciones se borran en cascada

-- ── 2. Personas que no existen ──────────────────────────────────────
DELETE FROM empleados WHERE clave IN ('e1', 'e4', 'e6', 'e7', 'e8');   -- salarios y deducciones en cascada
DELETE FROM usuarios  WHERE clave IN ('u2', 'u3', 'u4', 'u9', 'u10') AND estado = 'Inactivo';

-- ── 3. Cargo y área según el rol de Usuarios ────────────────────────
UPDATE empleados SET cargo = 'Auxiliar de alojamiento', departamento = 'Alojamiento', fecha_modificacion = NOW(),
  sogo_datos = JSON_ARRAY_INSERT(COALESCE(sogo_datos, JSON_OBJECT('history', JSON_ARRAY())), '$.history[0]',
    JSON_OBJECT('at', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i'), 'by', 'Juan Sebastián Pinilla', 'text', 'Cargo: Cocinero → Auxiliar de alojamiento · área Alojamiento (alineado con Usuarios)'))
WHERE clave = 'e2';
UPDATE empleados SET cargo = 'Auxiliar de alojamiento', departamento = 'Alojamiento', fecha_modificacion = NOW(),
  sogo_datos = JSON_ARRAY_INSERT(COALESCE(sogo_datos, JSON_OBJECT('history', JSON_ARRAY())), '$.history[0]',
    JSON_OBJECT('at', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i'), 'by', 'Juan Sebastián Pinilla', 'text', 'Cargo: Camarera → Auxiliar de alojamiento · área Alojamiento (alineado con Usuarios)'))
WHERE clave = 'e3';
UPDATE empleados SET cargo = 'Auxiliar de inventarios y nómina', departamento = 'Administración', fecha_modificacion = NOW(),
  sogo_datos = JSON_ARRAY_INSERT(COALESCE(sogo_datos, JSON_OBJECT('history', JSON_ARRAY())), '$.history[0]',
    JSON_OBJECT('at', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i'), 'by', 'Juan Sebastián Pinilla', 'text', 'Cargo: Mesera → Auxiliar de inventarios y nómina · área Administración (alineado con Usuarios)'))
WHERE clave = 'e5';

UPDATE usuarios SET cargo = 'Administrador'                    WHERE clave = 'w1';
UPDATE usuarios SET cargo = 'Contadora'                        WHERE clave = 'u5';
UPDATE usuarios SET cargo = 'Auxiliar de alojamiento'          WHERE clave IN ('u6', 'u8', 'u11');
UPDATE usuarios SET cargo = 'Auxiliar de inventarios y nómina' WHERE clave = 'u7';

-- ── 4. Empleados nuevos (tienen cuenta y reciben salario) ───────────
INSERT INTO empleados (clave, numero_empleado, nombre, apellido, tipo_documento, numero_documento, email, telefono, direccion,
                       cargo, departamento, fecha_contratacion, estado, activo, tipo_contrato, salario, riesgo_arl, tipo_cuenta,
                       usuario_id, fecha_creacion, fecha_modificacion, sogo_datos)
SELECT x.clave, x.codigo, u.nombre, u.apellido, 'CC · Cédula de ciudadanía', NULLIF(u.cedula_identidad, ''), u.email, COALESCE(u.telefono, ''), '',
       x.cargo, x.area, '2026-10-01', 'Activo', 1, 'Término indefinido', 1750905, 'I', 'Ahorros',
       u.id, NOW(), NOW(),
       JSON_OBJECT('history', JSON_ARRAY(JSON_OBJECT('at', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i'), 'by', 'Juan Sebastián Pinilla',
         'text', 'Empleado registrado desde Usuarios · salario e ingreso por confirmar')))
FROM usuarios u
JOIN (SELECT 'w1' AS usuario, 'e-w1' AS clave, 'TMP-1' AS codigo, 'Administrador' AS cargo, 'Administración' AS area
      UNION ALL SELECT 'u5',  'e-u5',  'TMP-2', 'Contadora',     'Administración'
      UNION ALL SELECT 'u11', 'e-u11', 'TMP-3', 'Auxiliar de alojamiento', 'Alojamiento') x ON x.usuario = u.clave
WHERE NOT EXISTS (SELECT 1 FROM empleados e WHERE e.usuario_id = u.id);

INSERT IGNORE INTO empleado_salarios (empleado_id, desde, monto)
SELECT id, '2026-10-01', 1750905 FROM empleados WHERE clave IN ('e-w1', 'e-u5', 'e-u11');

-- ── 5. Correos de la empresa (@sogo.com) ────────────────────────────
-- Andrés tenía cocina@sogo.com (no hay cocina): pasa a amunoz@sogo.com
UPDATE usuarios SET email = 'amunoz@sogo.com' WHERE clave = 'u6' AND email = 'cocina@sogo.com';
-- Cada empleado usa el mismo correo de su cuenta en Usuarios
UPDATE empleados e JOIN usuarios u ON u.id = e.usuario_id SET e.email = u.email WHERE u.email LIKE '%@sogo.com';
-- Juan Sebastián: su ficha usa sebastian@sogo.com. Su cuenta conserva sebastian@gmail.com
-- porque con ese correo inicia sesión y recupera la contraseña.
UPDATE empleados SET email = 'sebastian@sogo.com' WHERE clave = 'e-w1';

-- ── 6. Códigos consecutivos sin huecos ──────────────────────────────
UPDATE empleados SET numero_empleado = CONCAT('TMP-', clave) WHERE clave IN ('e2', 'e3', 'e5', 'e-w1', 'e-u5', 'e-u11');
UPDATE empleados SET numero_empleado = 'EMP-001' WHERE clave = 'e-w1';    -- Juan Sebastián Pinilla
UPDATE empleados SET numero_empleado = 'EMP-002' WHERE clave = 'e-u5';    -- Mónica Herrera Zuluaga
UPDATE empleados SET numero_empleado = 'EMP-003' WHERE clave = 'e2';      -- Andrés Muñoz Giraldo
UPDATE empleados SET numero_empleado = 'EMP-004' WHERE clave = 'e5';      -- Valentina Quintero Mejía
UPDATE empleados SET numero_empleado = 'EMP-005' WHERE clave = 'e3';      -- Diana Patricia Osorio
UPDATE empleados SET numero_empleado = 'EMP-006' WHERE clave = 'e-u11';   -- Daniela Ocampo Arias

COMMIT;

-- ── Comprobación: deben salir las mismas 6 personas que en Usuarios ──
SELECT e.numero_empleado AS codigo, CONCAT(e.nombre, ' ', e.apellido) AS empleado, e.email AS correo_empleado, u.email AS correo_cuenta, e.cargo, e.departamento AS area,
       e.estado, u.username AS usuario, u.estado AS cuenta, GROUP_CONCAT(r.nombre) AS rol
FROM empleados e
LEFT JOIN usuarios u ON u.id = e.usuario_id
LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
LEFT JOIN roles r ON r.id = ur.rol_id
GROUP BY e.id ORDER BY e.numero_empleado;
SELECT COUNT(*) AS nominas_restantes FROM nominas;
