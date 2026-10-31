-- =====================================================================
-- Dotación de la casa, por piso.
-- Fuente: "Presupuesto de inversión dotación – Proyecto Hospedaje
-- Sebastián – Filandia 2027".
--
--   precio_unitario = lo que se le cobra al huésped si pierde o daña
--                     una unidad (el administrador lo puede cambiar).
--   cobrable = 0     -> no se cobra al huésped: equipos del personal
--                     (registradora, datáfono, computador, tablet) y
--                     amenities, que se le entregan para que los use.
--   cantidad         -> unidades que hay en cada piso.
--   consumo_anual    -> solo amenities: consumo estimado al año con
--                     ocupación del 60 % (no son existencias).
--
-- El hospedaje NO vende comidas ni bebidas: presta la cocina y su
-- dotación. Lo que el huésped pierda o dañe se registra en el check-out
-- como consumo de categoría "Daños y faltantes".
--
-- Ejecutar una vez. Se puede repetir: no duplica ni borra cambios de
-- precio que haya hecho el administrador (al repetirlo, el ALTER TABLE
-- consumos da "Duplicate column name": es normal, ya estaba aplicado).
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;   -- tildes y ñ correctas aunque se ejecute desde la consola de Windows

CREATE TABLE IF NOT EXISTS dotacion (
  id                  BIGINT        NOT NULL AUTO_INCREMENT,
  categoria           VARCHAR(50)   NOT NULL,   -- Muebles y enseres | Lencería | Equipos eléctricos y de comunicación | Dotación de cocina | Amenities
  nombre              VARCHAR(150)  NOT NULL,
  precio_unitario     DECIMAL(14,2) NOT NULL,
  cobrable            TINYINT(1)    NOT NULL DEFAULT 1,
  orden               INT           NOT NULL DEFAULT 0,
  activo              TINYINT(1)    NOT NULL DEFAULT 1,
  fecha_modificacion  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  modificado_por      BIGINT        DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_dotacion (categoria, nombre),
  CONSTRAINT fk_dotacion_usuario FOREIGN KEY (modificado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS dotacion_cantidades (
  dotacion_id    BIGINT        NOT NULL,
  piso           INT           NOT NULL,
  cantidad       DECIMAL(10,2) NOT NULL DEFAULT 0,
  consumo_anual  DECIMAL(10,2) DEFAULT NULL,
  PRIMARY KEY (dotacion_id, piso),
  CONSTRAINT fk_dotacion_cant FOREIGN KEY (dotacion_id) REFERENCES dotacion (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cobros por pérdida o daño: van en `consumos`, enlazados al artículo
ALTER TABLE consumos
  ADD COLUMN dotacion_id BIGINT      DEFAULT NULL,
  ADD COLUMN piso        INT         DEFAULT NULL,
  ADD COLUMN motivo      VARCHAR(20) DEFAULT NULL,   -- Faltante | Dañado
  ADD CONSTRAINT fk_consumos_dotacion FOREIGN KEY (dotacion_id) REFERENCES dotacion (id);

-- ---------------------------------------------------------------------
-- Catálogo: (categoría, nombre, precio, cobrable, orden, piso 1, piso 2)
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS carga_dotacion;
CREATE TEMPORARY TABLE carga_dotacion (
  categoria VARCHAR(50), nombre VARCHAR(150), precio DECIMAL(14,2), cobrable TINYINT, orden INT,
  piso1 DECIMAL(10,2), piso2 DECIMAL(10,2), anual1 DECIMAL(10,2), anual2 DECIMAL(10,2),
  PRIMARY KEY (categoria, nombre)   -- Aiven exige clave primaria también en las tablas temporales
);

INSERT INTO carga_dotacion VALUES
-- MUEBLES Y ENSERES
('Muebles y enseres', 'Cama doble (1,40 de ancho)',          1500000, 1,  1,  3,  4, NULL, NULL),
('Muebles y enseres', 'Camarote dos niveles (1,00 de ancho)', 800000, 1,  2,  1,  3, NULL, NULL),
('Muebles y enseres', 'Nochero',                              350000, 1,  3,  3,  4, NULL, NULL),
('Muebles y enseres', 'Silla',                                 60000, 1,  4,  3,  4, NULL, NULL),
('Muebles y enseres', 'Sala de recibo',                      3500000, 1,  5,  1,  1, NULL, NULL),
('Muebles y enseres', 'Mesa de centro',                       600000, 1,  6,  1,  1, NULL, NULL),
('Muebles y enseres', 'Estantería del vestíbulo (lobby)',    1500000, 1,  7,  1,  1, NULL, NULL),
('Muebles y enseres', 'Colchón cama 1,40',                   1800000, 1,  8,  3,  4, NULL, NULL),
('Muebles y enseres', 'Colchón camarote 1,00',                900000, 1,  9,  2,  6, NULL, NULL),
('Muebles y enseres', 'Mueble de recepción',                 1500000, 1, 10,  0,  1, NULL, NULL),
('Muebles y enseres', 'Comedor',                             3000000, 1, 11,  1,  1, NULL, NULL),
('Muebles y enseres', 'Papelera de piso',                      80000, 1, 12,  4,  5, NULL, NULL),
('Muebles y enseres', 'Mesa auxiliar plegable',               800000, 1, 13,  1,  1, NULL, NULL),
-- LENCERÍA
('Lencería', 'Cubrelecho cama doble',                         200000, 1,  1,  3,  4, NULL, NULL),
('Lencería', 'Cobija grande',                                 800000, 1,  2,  3,  4, NULL, NULL),
('Lencería', 'Cobija pequeña',                                500000, 1,  3,  2,  6, NULL, NULL),
('Lencería', 'Cubrelecho colchón camarote',                   150000, 1,  4,  2,  6, NULL, NULL),
('Lencería', 'Almohada grande',                                60000, 1,  5,  8, 14, NULL, NULL),
('Lencería', 'Funda de almohada grande',                       30000, 1,  6, 16, 28, NULL, NULL),
('Lencería', 'Sábana grande',                                  80000, 1,  7,  9, 12, NULL, NULL),
('Lencería', 'Sobresábana grande',                             80000, 1,  8,  9, 12, NULL, NULL),
('Lencería', 'Sábana sencilla',                                60000, 1,  9,  6,  6, NULL, NULL),
('Lencería', 'Sobresábana sencilla',                           60000, 1, 10, 16,  6, NULL, NULL),
('Lencería', 'Almohada sencilla',                              30000, 1, 11,  8, 10, NULL, NULL),
('Lencería', 'Funda de almohada sencilla',                     15000, 1, 12, 24, 30, NULL, NULL),
('Lencería', 'Toalla de baño',                                 40000, 1, 13, 16, 24, NULL, NULL),
('Lencería', 'Toalla de mano',                                 25000, 1, 14,  4,  6, NULL, NULL),
('Lencería', 'Toalla de piso de baño',                         35000, 1, 15,  2,  3, NULL, NULL),
('Lencería', 'Mantel de comedor',                             300000, 1, 16,  2,  2, NULL, NULL),
-- EQUIPOS ELÉCTRICOS Y DE COMUNICACIÓN
('Equipos eléctricos y de comunicación', 'Televisor de sala',                 1200000, 1, 1, 1, 1, NULL, NULL),
('Equipos eléctricos y de comunicación', 'Nevera grande',                     3500000, 1, 2, 1, 1, NULL, NULL),
('Equipos eléctricos y de comunicación', 'Lavadora secadora',                 5000000, 1, 3, 1, 0, NULL, NULL),
('Equipos eléctricos y de comunicación', 'Registradora',                       800000, 0, 4, 1, 0, NULL, NULL),
('Equipos eléctricos y de comunicación', 'Datáfono independiente (Bold Smartpro)', 400000, 0, 5, 0, 1, NULL, NULL),
('Equipos eléctricos y de comunicación', 'Computador (PMS en la nube)',       2500000, 0, 6, 0, 1, NULL, NULL),
('Equipos eléctricos y de comunicación', 'Tablet de contingencia',             900000, 0, 7, 0, 1, NULL, NULL),
-- DOTACIÓN DE COCINA (se presta con la cocina)
('Dotación de cocina', 'Vajilla',            280000, 1,  1,  2,  4, NULL, NULL),
('Dotación de cocina', 'Sartén',              70000, 1,  2,  2,  2, NULL, NULL),
('Dotación de cocina', 'Cubierto',             5000, 1,  3, 24, 36, NULL, NULL),
('Dotación de cocina', 'Vaso',                 5000, 1,  4, 16, 24, NULL, NULL),
('Dotación de cocina', 'Pocillo de café',      8000, 1,  5, 16, 24, NULL, NULL),
('Dotación de cocina', 'Cafetera grande',    150000, 1,  6,  1,  1, NULL, NULL),
('Dotación de cocina', 'Cucharón sopero',     20000, 1,  7,  1,  1, NULL, NULL),
('Dotación de cocina', 'Cucharón de rotos',   20000, 1,  8,  1,  1, NULL, NULL),
('Dotación de cocina', 'Cucharón de pasta',   20000, 1,  9,  1,  1, NULL, NULL),
('Dotación de cocina', 'Cucharón de jugo',    20000, 1, 10,  1,  1, NULL, NULL),
('Dotación de cocina', 'Jarra de jugo',       15000, 1, 11,  2,  2, NULL, NULL),
('Dotación de cocina', 'Licuadora',          300000, 1, 12,  1,  1, NULL, NULL),
('Dotación de cocina', 'Exprimidora',        180000, 1, 13,  1,  1, NULL, NULL),
('Dotación de cocina', 'Picadora',           150000, 1, 14,  1,  1, NULL, NULL),
('Dotación de cocina', 'Tabla de cocina',     35000, 1, 15,  1,  1, NULL, NULL),
('Dotación de cocina', 'Guante de cocina',    12000, 1, 16,  1,  1, NULL, NULL),
('Dotación de cocina', 'Parrilla de arepa',   25000, 1, 17,  1,  1, NULL, NULL),
-- AMENITIES (consumibles: no se cobran; consumo anual estimado, ocupación 60 %)
('Amenities', 'Jabón corporal',              400, 0, 1, 0, 0, 1095, 2555),
('Amenities', 'Jabón de manos',              400, 0, 2, 0, 0, 1095, 2555),
('Amenities', 'Champú en sachet',            600, 0, 3, 0, 0, 1095, 2555),
('Amenities', 'Papel higiénico',            1000, 0, 4, 0, 0, 1095, 2555),
('Amenities', 'Bolsa de papelera de baño',    80, 0, 5, 0, 0,  438,  657);

INSERT IGNORE INTO dotacion (categoria, nombre, precio_unitario, cobrable, orden)
SELECT categoria, nombre, precio, cobrable, orden FROM carga_dotacion;

-- Un INSERT por piso: MySQL no deja usar dos veces una tabla temporal en la misma consulta
INSERT IGNORE INTO dotacion_cantidades (dotacion_id, piso, cantidad, consumo_anual)
SELECT d.id, 1, c.piso1, c.anual1 FROM carga_dotacion c JOIN dotacion d ON d.categoria = c.categoria AND d.nombre = c.nombre;

INSERT IGNORE INTO dotacion_cantidades (dotacion_id, piso, cantidad, consumo_anual)
SELECT d.id, 2, c.piso2, c.anual2 FROM carga_dotacion c JOIN dotacion d ON d.categoria = c.categoria AND d.nombre = c.nombre;

DROP TEMPORARY TABLE carga_dotacion;

-- Verificación: valor de la dotación por categoría y piso (precio × cantidad)
SELECT d.categoria,
       SUM(CASE WHEN q.piso = 1 THEN q.cantidad * d.precio_unitario ELSE 0 END) AS piso_1,
       SUM(CASE WHEN q.piso = 2 THEN q.cantidad * d.precio_unitario ELSE 0 END) AS piso_2,
       SUM(q.cantidad * d.precio_unitario) AS total,
       COUNT(DISTINCT d.id) AS articulos
FROM dotacion d JOIN dotacion_cantidades q ON q.dotacion_id = d.id
GROUP BY d.categoria ORDER BY MIN(d.id);
