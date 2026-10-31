-- =====================================================================
-- Crea la primera cuenta de administrador (sirve para SOGO y para la
-- administración de la página web). Se crea SIN contraseña: el script
-- devuelve un enlace de un solo uso, válido 24 horas, para definirla.
--
-- 1. Cambia el correo y el nombre de las dos primeras líneas.
-- 2. Ejecuta el archivo completo (rayo, sin seleccionar nada).
-- 3. Con el backend y el frontend de SOGO encendidos, abre el enlace
--    que aparece en el resultado y define tu contraseña.
-- =====================================================================
USE hotel_sebastian;

SET @correo   = 'sebastian@gmail.com';
SET @nombre   = 'Juan Sebastián';
SET @apellido = 'Pinilla';
SET @sogo_url = 'http://localhost:4201';

-- Cuenta (si el correo ya existe, solo se le genera un enlace nuevo)
INSERT INTO usuarios (email, nombre, apellido, rol, activo, estado, fecha_registro, proveedor_auth)
VALUES (@correo, @nombre, @apellido, 'ADMIN', 1, 'Activo', NOW(), 'local')
ON DUPLICATE KEY UPDATE activo = 1, estado = 'Activo';

-- El servidor busca el enlace por su SHA-256 (nunca guarda el token tal cual): se guarda el hash
-- y el enlace lleva el token original. Antes se guardaba sin cifrar y el enlace nunca funcionaba.
SET @token = UUID();
UPDATE usuarios
SET reset_token = SHA2(@token, 256), reset_token_expiry = NOW() + INTERVAL 24 HOUR
WHERE email = @correo;

-- Rol Administrador de SOGO
INSERT IGNORE INTO usuario_roles (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u JOIN roles r ON r.nombre = 'Administrador'
WHERE u.email = @correo;

-- Enlace para definir la contraseña (ábrelo con SOGO encendido)
SELECT u.email,
       GROUP_CONCAT(r.nombre) AS roles_sogo,
       CONCAT(@sogo_url, '/reset?token=', @token) AS enlace_para_definir_contrasena
FROM usuarios u
LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
LEFT JOIN roles r ON r.id = ur.rol_id
WHERE u.email = @correo
GROUP BY u.id;
