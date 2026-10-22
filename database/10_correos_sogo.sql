-- =====================================================================
-- Correos de la empresa (@sogo.com) para los administradores
--
--   Juan Sebastián Pinilla: sebastian@gmail.com → sebastian@sogo.com
--     (también su nombre de usuario, que era el mismo correo, y su ficha
--      de empleado EMP-001)
--   Guillermo Pinilla:      guillermo@gmail.com → guillermo@sogo.com
--     (su nombre de usuario sigue siendo gpinilla)
--   Andrés Muñoz Giraldo:   cocina@sogo.com → amunoz@sogo.com
--   Fichas de empleado de Andrés, Valentina y Diana: el correo @sogo.com de su cuenta
--
-- IMPORTANTE: desde ahora se inicia sesión con el correo nuevo (o con el
-- usuario gpinilla). La contraseña NO cambia. La recuperación de contraseña
-- llegará al buzón @sogo.com.
--
-- Ejecutar una vez, completo (rayo sin seleccionar nada).
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

UPDATE usuarios
   SET email = 'sebastian@sogo.com',
       username = IF(username IS NULL OR username = 'sebastian@gmail.com', 'sebastian@sogo.com', username)
 WHERE email = 'sebastian@gmail.com';

UPDATE usuarios
   SET email = 'guillermo@sogo.com'
 WHERE email = 'guillermo@gmail.com';

-- Andrés tenía cocina@sogo.com (no hay cocina)
UPDATE usuarios SET email = 'amunoz@sogo.com' WHERE email = 'cocina@sogo.com';

-- Cada ficha de empleado usa el mismo correo @sogo.com de su cuenta
UPDATE empleados e JOIN usuarios u ON u.id = e.usuario_id
   SET e.email = u.email
 WHERE u.email LIKE '%@sogo.com';

COMMIT;

-- ── Comprobación ────────────────────────────────────────────────────
SELECT CONCAT(u.nombre, ' ', u.apellido) AS nombre, u.username AS usuario, u.email AS correo_cuenta,
       e.numero_empleado AS empleado, e.email AS correo_empleado
FROM usuarios u LEFT JOIN empleados e ON e.usuario_id = u.id
ORDER BY u.id;
