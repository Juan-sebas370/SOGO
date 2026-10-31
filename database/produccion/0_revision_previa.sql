-- GENERADO. Cada consulta debe devolver 0 filas antes de aplicar 1_estructura_sogo.sql.
-- =====================================================================
-- Ejecutar ANTES de 01_estructura_sogo.sql.
-- Cada consulta debe devolver 0 filas. Si alguna devuelve filas, hay
-- datos que impedirían crear las llaves foráneas o únicas: corrígelos
-- (o avísame) antes de continuar.
-- =====================================================================

-- 1. Reservas que apuntan a una habitación que no existe
SELECT r.id, r.habitacion_id FROM reservas r
LEFT JOIN habitaciones h ON h.id = r.habitacion_id
WHERE r.habitacion_id IS NOT NULL AND h.id IS NULL;

-- 2. reserva_habitaciones con habitaciones que no existen
SELECT rh.reserva_id, rh.habitacion_id FROM reserva_habitaciones rh
LEFT JOIN habitaciones h ON h.id = rh.habitacion_id
WHERE rh.habitacion_id IS NOT NULL AND h.id IS NULL;

-- 3. Números de habitación repetidos
SELECT numero, COUNT(*) AS veces FROM habitaciones
GROUP BY numero HAVING COUNT(*) > 1;

-- 4. Números de empleado repetidos
SELECT numero_empleado, COUNT(*) AS veces FROM empleados
WHERE numero_empleado IS NOT NULL
GROUP BY numero_empleado HAVING COUNT(*) > 1;

-- 5. Que ninguna de las tablas nuevas exista ya (debe dar 0 filas)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('consecutivos','configuracion','roles','rol_permisos','usuario_roles','auditoria',
                     'historial_cambios','terceros','empleado_salarios','empleado_deducciones',
                     'parametros_nomina','nominas','nomina_novedades','nomina_liquidaciones',
                     'comprobantes_pago','habitacion_estados','huespedes','reserva_huespedes',
                     'consumos','tra_registros','tra_unidades','tra_envios','tra_eventos','facturas',
                     'factura_lineas','factura_eventos','categorias_inventario','productos_inventario',
                     'movimientos_inventario','movimiento_inventario_lineas','alertas_inventario',
                     'menu_productos','pedidos_restaurante','pedido_restaurante_items','cuentas_puc',
                     'asientos','asiento_lineas','asiento_soportes','reportes_programados',
                     'reportes_ejecuciones');
