-- =====================================================================
-- Usuario de MySQL propio para el backend de SOGO.
-- Puede leer y escribir datos, pero NO crear, alterar ni borrar tablas:
-- así SOGO nunca puede dañar la estructura que usa la página web.
--
-- Cambia 'CAMBIA_ESTA_CLAVE' por una contraseña segura antes de ejecutar,
-- y NO guardes este archivo con la clave real (ni lo subas a GitHub).
-- =====================================================================
CREATE USER IF NOT EXISTS 'sogo_user'@'localhost' IDENTIFIED BY 'Admin123';

GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_sebastian.* TO 'sogo_user'@'localhost';

FLUSH PRIVILEGES;
