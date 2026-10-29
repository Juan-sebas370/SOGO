-- Datos de PRUEBA: las 7 habitaciones de la casa (en producción las crea la página web).
-- Solo para la base aislada de pruebas; después se ejecuta 04_datos_habitaciones.sql para completarlas.
USE hotel_sebastian;
INSERT INTO habitaciones (numero, piso, tipo, capacidad, precio_noche, estado, activa, bano, wifi, television, climatizacion, minibar) VALUES
('101', 1, 'Familiar', 4, 80000, 'Disponible', 1, 1, 1, 1, 0, 0),
('102', 1, 'Doble',    2, 70000, 'Disponible', 1, 0, 1, 1, 0, 0),
('103', 1, 'Doble',    2, 70000, 'Disponible', 1, 0, 1, 1, 0, 0),
('201', 2, 'Familiar', 4, 80000, 'Disponible', 1, 1, 1, 1, 0, 0),
('202', 2, 'Doble',    2, 70000, 'Disponible', 1, 0, 1, 1, 0, 0),
('203', 2, 'Doble',    2, 70000, 'Disponible', 1, 0, 1, 1, 0, 0),
('204', 2, 'Familiar', 4, 80000, 'Disponible', 1, 1, 1, 1, 0, 0);
