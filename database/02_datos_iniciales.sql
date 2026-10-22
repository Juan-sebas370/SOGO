-- =====================================================================
-- Datos iniciales que SOGO necesita para arrancar.
-- Ejecutar después de 01_estructura_sogo.sql. Se puede repetir sin
-- duplicar nada (INSERT IGNORE / ON DUPLICATE KEY).
-- =====================================================================
USE hotel_sebastian;

-- ── Roles ────────────────────────────────────────────
INSERT IGNORE INTO roles (nombre, descripcion, nivel, color, bloqueado) VALUES
  ('Administrador',            'Acceso total al sistema, usuarios y configuración.',                   'Total',    'admin', 1),
  ('Consulta',                 'Solo lectura de la operación diaria.',                                  'Consulta', 'cons',  0),
  ('Recepcionista',            'Atiende reservas, check-in/check-out, TRA y facturas de alojamiento.', 'Operador', 'recep', 0),
  ('Operador Restaurante',     'Pedidos, cuentas y caja del restaurante.',                              'Operador', 'rest',  0),
  ('Operador Alojamiento',     'Estado, limpieza y mantenimiento de las habitaciones.',                 'Operador', 'aloj',  0),
  ('Contador',                 'Facturación, contabilidad y revisión de nómina.',                       'Operador', 'cont',  0),
  ('Aux. Nómina e Inventario', 'Liquida la nómina y lleva el inventario.',                              'Operador', 'aux',   0);

UPDATE roles r JOIN roles p ON p.nombre = 'Consulta'
SET r.rol_padre_id = p.id WHERE r.nombre = 'Recepcionista';

-- Permisos: (rol, módulo, ver, crear, editar, eliminar, exportar)
INSERT INTO rol_permisos (rol_id, modulo, ver, crear, editar, eliminar, exportar)
SELECT r.id, m.modulo, m.v, m.c, m.e, m.d, m.x
FROM (
  SELECT 'Administrador' rol, 'Reservas' modulo, 1 v, 1 c, 1 e, 1 d, 1 x UNION ALL
  SELECT 'Administrador', 'Alojamiento',   1,1,1,1,1 UNION ALL
  SELECT 'Administrador', 'TRA',           1,1,1,1,1 UNION ALL
  SELECT 'Administrador', 'Facturación',   1,1,1,1,1 UNION ALL
  SELECT 'Administrador', 'Restaurante',   1,1,1,1,1 UNION ALL
  SELECT 'Administrador', 'Inventarios',   1,1,1,1,1 UNION ALL
  SELECT 'Administrador', 'Reportes',      1,1,1,1,1 UNION ALL
  SELECT 'Administrador', 'Nómina',        1,1,1,1,1 UNION ALL
  SELECT 'Administrador', 'Contabilidad',  1,1,1,1,1 UNION ALL
  SELECT 'Administrador', 'Usuarios',      1,1,1,1,1 UNION ALL
  SELECT 'Administrador', 'Configuración', 1,1,1,1,1 UNION ALL

  SELECT 'Consulta', 'Reservas',    1,0,0,0,0 UNION ALL
  SELECT 'Consulta', 'Alojamiento', 1,0,0,0,0 UNION ALL
  SELECT 'Consulta', 'Restaurante', 1,0,0,0,0 UNION ALL
  SELECT 'Consulta', 'Inventarios', 1,0,0,0,0 UNION ALL
  SELECT 'Consulta', 'Reportes',    1,0,0,0,0 UNION ALL

  SELECT 'Recepcionista', 'Reservas',    1,1,1,0,0 UNION ALL
  SELECT 'Recepcionista', 'Alojamiento', 1,1,1,0,0 UNION ALL
  SELECT 'Recepcionista', 'TRA',         1,1,1,0,0 UNION ALL
  SELECT 'Recepcionista', 'Facturación', 1,1,0,0,0 UNION ALL

  SELECT 'Operador Restaurante', 'Restaurante', 1,1,1,0,0 UNION ALL
  SELECT 'Operador Restaurante', 'Inventarios', 1,0,0,0,0 UNION ALL
  SELECT 'Operador Restaurante', 'Reportes',    1,0,0,0,0 UNION ALL

  SELECT 'Operador Alojamiento', 'Alojamiento', 1,1,1,0,0 UNION ALL
  SELECT 'Operador Alojamiento', 'Reservas',    1,0,0,0,0 UNION ALL
  SELECT 'Operador Alojamiento', 'Inventarios', 1,0,0,0,0 UNION ALL

  SELECT 'Contador', 'Contabilidad', 1,1,1,1,1 UNION ALL
  SELECT 'Contador', 'Facturación',  1,1,1,1,1 UNION ALL
  SELECT 'Contador', 'Nómina',       1,0,0,0,1 UNION ALL
  SELECT 'Contador', 'Reportes',     1,0,0,0,1 UNION ALL
  SELECT 'Contador', 'Inventarios',  1,0,0,0,0 UNION ALL

  SELECT 'Aux. Nómina e Inventario', 'Nómina',      1,1,1,0,0 UNION ALL
  SELECT 'Aux. Nómina e Inventario', 'Inventarios', 1,1,1,0,1 UNION ALL
  SELECT 'Aux. Nómina e Inventario', 'Reportes',    1,0,0,0,1 UNION ALL
  SELECT 'Aux. Nómina e Inventario', 'Restaurante', 1,0,0,0,0
) m
JOIN roles r ON r.nombre = m.rol
ON DUPLICATE KEY UPDATE ver = VALUES(ver), crear = VALUES(crear), editar = VALUES(editar),
                        eliminar = VALUES(eliminar), exportar = VALUES(exportar);

-- Los usuarios que ya tenían rol ADMIN en la web quedan como Administrador
INSERT IGNORE INTO usuario_roles (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u JOIN roles r ON r.nombre = 'Administrador'
WHERE UPPER(u.rol) = 'ADMIN';

-- ── Métodos de pago (los que ya existan no se tocan) ─
INSERT IGNORE INTO metodos_pago (nombre, tipo, activo) VALUES
  ('Efectivo', 'EFECTIVO', 1),
  ('Nequi', 'BILLETERA', 1),
  ('Daviplata', 'BILLETERA', 1),
  ('Transferencia', 'TRANSFERENCIA', 1),
  ('Tarjeta débito', 'TARJETA', 1),
  ('Tarjeta crédito', 'TARJETA', 1),
  ('Wompi', 'PASARELA', 1);

-- ── Categorías de inventario ─────────────────────────
INSERT IGNORE INTO categorias_inventario (nombre, prefijo) VALUES
  ('Alimentos', 'ALI'), ('Bebidas', 'BEB'), ('Aseo', 'ASE'), ('Amenities', 'AME'),
  ('Lencería', 'LEN'), ('Papelería', 'PAP'), ('Mantenimiento', 'MAN');

-- ── Parámetros de nómina ─────────────────────────────
INSERT IGNORE INTO parametros_nomina (anio, smmlv, auxilio_transporte, jornada_semanal, reglas) VALUES
  (2025, 1423500, 200000, 44, JSON_OBJECT('extraDay', 0.25, 'extraNight', 0.75, 'nightSurcharge', 0.35)),
  (2026, 1750905, 249095, 42, JSON_OBJECT('extraDay', 0.25, 'extraNight', 0.75, 'nightSurcharge', 0.35));

-- ── Plan de cuentas (PUC) usado por SOGO ─────────────
INSERT IGNORE INTO cuentas_puc (codigo, nombre, clase, corriente, contraria) VALUES
  ('110505', 'Caja general', 'Activo', 1, 0),
  ('111005', 'Bancos', 'Activo', 1, 0),
  ('130505', 'Clientes nacionales', 'Activo', 1, 0),
  ('133005', 'Anticipos a proveedores', 'Activo', 1, 0),
  ('143505', 'Inventario de mercancías', 'Activo', 1, 0),
  ('150405', 'Terrenos', 'Activo', 0, 0),
  ('151605', 'Construcciones y edificaciones', 'Activo', 0, 0),
  ('152405', 'Muebles y enseres', 'Activo', 0, 0),
  ('152005', 'Equipo de cocina', 'Activo', 0, 0),
  ('152805', 'Equipo de cómputo', 'Activo', 0, 0),
  ('159205', 'Depreciación acumulada', 'Activo', 0, 1),
  ('210505', 'Obligaciones financieras · crédito remodelación', 'Pasivo', 0, 0),
  ('220505', 'Proveedores nacionales', 'Pasivo', 1, 0),
  ('236525', 'Retención en la fuente · servicios', 'Pasivo', 1, 0),
  ('236530', 'Retención en la fuente · honorarios', 'Pasivo', 1, 0),
  ('236540', 'Retención en la fuente · compras', 'Pasivo', 1, 0),
  ('237005', 'Aportes de seguridad social y caja', 'Pasivo', 1, 0),
  ('238030', 'Libranzas y descuentos de nómina', 'Pasivo', 1, 0),
  ('240805', 'IVA por pagar', 'Pasivo', 1, 0),
  ('240810', 'IVA descontable', 'Pasivo', 1, 0),
  ('249505', 'Impuesto al consumo por pagar', 'Pasivo', 1, 0),
  ('250505', 'Salarios por pagar', 'Pasivo', 1, 0),
  ('261005', 'Prestaciones sociales por pagar', 'Pasivo', 1, 0),
  ('280505', 'Anticipos de clientes (reservas)', 'Pasivo', 1, 0),
  ('310505', 'Capital', 'Patrimonio', 0, 0),
  ('370505', 'Resultados de ejercicios anteriores', 'Patrimonio', 0, 0),
  ('415505', 'Alojamiento', 'Ingreso', 0, 0),
  ('415510', 'Eventos y pasadías', 'Ingreso', 0, 0),
  ('415515', 'Restaurante y cafetería', 'Ingreso', 0, 0),
  ('415520', 'Servicios adicionales', 'Ingreso', 0, 0),
  ('421005', 'Ingresos financieros · intereses', 'Ingreso', 0, 0),
  ('425050', 'Recuperaciones y donaciones de inventario', 'Ingreso', 0, 0),
  ('510506', 'Sueldos', 'Gasto', 0, 0),
  ('510515', 'Horas extra y recargos', 'Gasto', 0, 0),
  ('510527', 'Auxilio de transporte', 'Gasto', 0, 0),
  ('510548', 'Bonificaciones', 'Gasto', 0, 0),
  ('510568', 'Aportes seguridad social y caja', 'Gasto', 0, 0),
  ('510530', 'Prestaciones sociales (provisión)', 'Gasto', 0, 0),
  ('511025', 'Honorarios · asesoría contable', 'Gasto', 0, 0),
  ('511505', 'Impuesto de industria y comercio', 'Gasto', 0, 0),
  ('513525', 'Acueducto y alcantarillado', 'Gasto', 0, 0),
  ('513530', 'Energía eléctrica', 'Gasto', 0, 0),
  ('513535', 'Teléfono e internet', 'Gasto', 0, 0),
  ('514510', 'Mantenimiento de construcciones', 'Gasto', 0, 0),
  ('514525', 'Mantenimiento de equipos', 'Gasto', 0, 0),
  ('516005', 'Depreciación · construcciones y edificaciones', 'Gasto', 0, 0),
  ('516015', 'Depreciación · muebles y enseres', 'Gasto', 0, 0),
  ('516020', 'Depreciación · equipo de cocina', 'Gasto', 0, 0),
  ('519525', 'Elementos de aseo y cafetería', 'Gasto', 0, 0),
  ('519530', 'Útiles y papelería', 'Gasto', 0, 0),
  ('519595', 'Software y plataformas', 'Gasto', 0, 0),
  ('530505', 'Gastos bancarios', 'Gasto', 0, 0),
  ('539520', 'Pérdidas y bajas de inventario', 'Gasto', 0, 0),
  ('613505', 'Costo de ventas · restaurante', 'Costo', 0, 0);
