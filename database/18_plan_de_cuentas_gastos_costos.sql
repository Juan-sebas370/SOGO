-- =====================================================================
-- Plan de cuentas del contador · parte 2: gastos (5) y costos (6)
-- (hojas "plan de cuentas2", 7 págs.)
--
--  · Carga las cuentas de las hojas. Las marcadas "NO" no se cargan:
--    520557, 520558, 520561, 520562, 520581, 521015, 522005, 523015,
--    523020, 523070, 524505, 525510, 526025, 531305 y "Venta en tiendas
--    y droguerías" (614095).
--  · 614095 repetía código: sus servicios quedan como auxiliares de 8
--    dígitos (61409501 Lavandería ... 61409505 Cigarrillos), igual que en
--    los ingresos (41409501...).
--  · Las cuentas de gasto que SOGO usaba (grupo 51) pasan a la cuenta de
--    la hoja (grupo 52). Sus movimientos pasan a la cuenta nueva (mismo
--    número y valores) y la cuenta vieja se quita:
--      510506 Sueldos → 520506          510515 Horas extra → 520515
--      510527 Auxilio de transporte → 520527   510548 Bonificaciones → 520548
--      510568 Aportes del empleador → 520569 EPS (los nuevos asientos de
--             nómina ya separan EPS, pensión, ARP, caja, ICBF y SENA)
--      510530 Prestaciones → 520530 Cesantías (los nuevos asientos separan
--             cesantías, intereses, prima, vacaciones y dotación)
--      511025 Honorarios contador → 521030 Asesoría financiera
--      511505 Industria y comercio → 521505
--      513525 Acueducto → 523525   513530 Energía → 523530   513535 Teléfono → 523535
--      514510 Mant. construcciones → 524510   514525 Mant. equipos → 524515
--      516005 / 516015 / 516020 Depreciación → 526005 / 526015 / 526030
--      519525 Aseo y cafetería → 529525   519530 Papelería → 529530
--      519595 Software → 523520 Procesamiento electrónico de datos
--      613505 Costo restaurante → 614015 Restaurantes
--      539520 Pérdidas de inventario → 531095 (en la hoja, 539520 es
--             "Multas, sanciones y litigios")
--
-- No borra movimientos. Solo toca tablas de Contabilidad: la web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 17.
-- Se puede volver a ejecutar sin problema.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── 1. Cuentas de las hojas (crea o corrige nombre, clase y naturaleza) ──
INSERT INTO cuentas_puc (codigo, nombre, clase, corriente, contraria, activa) VALUES
  ('5', 'Gastos', 'Gasto', 0, 0, 1),
  ('52', 'Operacionales de ventas', 'Gasto', 0, 0, 1),
  ('5205', 'Gastos de personal', 'Gasto', 0, 0, 1),
  ('520503', 'Salario integral', 'Gasto', 0, 0, 1),
  ('520506', 'Sueldos', 'Gasto', 0, 0, 1),
  ('520515', 'Horas extras y recargos', 'Gasto', 0, 0, 1),
  ('520518', 'Comisiones', 'Gasto', 0, 0, 1),
  ('520521', 'Viáticos', 'Gasto', 0, 0, 1),
  ('520524', 'Incapacidades', 'Gasto', 0, 0, 1),
  ('520527', 'Auxilio de transporte', 'Gasto', 0, 0, 1),
  ('520530', 'Cesantías', 'Gasto', 0, 0, 1),
  ('520533', 'Intereses sobre cesantías', 'Gasto', 0, 0, 1),
  ('520536', 'Prima de servicios', 'Gasto', 0, 0, 1),
  ('520539', 'Vacaciones', 'Gasto', 0, 0, 1),
  ('520542', 'Primas extralegales', 'Gasto', 0, 0, 1),
  ('520545', 'Auxilios', 'Gasto', 0, 0, 1),
  ('520548', 'Bonificaciones', 'Gasto', 0, 0, 1),
  ('520551', 'Dotación y suministro a trabajadores', 'Gasto', 0, 0, 1),
  ('520554', 'Seguros', 'Gasto', 0, 0, 1),
  ('520559', 'Pensiones de jubilación', 'Gasto', 0, 0, 1),
  ('520560', 'Indemnizaciones laborales', 'Gasto', 0, 0, 1),
  ('520563', 'Capacitación al personal', 'Gasto', 0, 0, 1),
  ('520566', 'Gastos deportivos y de recreación', 'Gasto', 0, 0, 1),
  ('520568', 'Aportes a administradoras de riesgos profesionales, ARP', 'Gasto', 0, 0, 1),
  ('520569', 'Aportes a entidades promotoras de salud, EPS', 'Gasto', 0, 0, 1),
  ('520570', 'Aportes a fondos de pensiones y/o cesantías', 'Gasto', 0, 0, 1),
  ('520572', 'Aportes cajas de compensación familiar', 'Gasto', 0, 0, 1),
  ('520575', 'Aportes ICBF', 'Gasto', 0, 0, 1),
  ('520578', 'SENA', 'Gasto', 0, 0, 1),
  ('520584', 'Gastos médicos y drogas', 'Gasto', 0, 0, 1),
  ('520595', 'Otros', 'Gasto', 0, 0, 1),
  ('5210', 'Honorarios', 'Gasto', 0, 0, 1),
  ('521005', 'Junta directiva', 'Gasto', 0, 0, 1),
  ('521010', 'Revisoría fiscal', 'Gasto', 0, 0, 1),
  ('521020', 'Avalúos', 'Gasto', 0, 0, 1),
  ('521025', 'Asesoría jurídica', 'Gasto', 0, 0, 1),
  ('521030', 'Asesoría financiera', 'Gasto', 0, 0, 1),
  ('521035', 'Asesoría técnica', 'Gasto', 0, 0, 1),
  ('521095', 'Otros', 'Gasto', 0, 0, 1),
  ('5215', 'Impuestos', 'Gasto', 0, 0, 1),
  ('521505', 'Industria y comercio', 'Gasto', 0, 0, 1),
  ('521510', 'De timbres', 'Gasto', 0, 0, 1),
  ('521515', 'A la propiedad raíz', 'Gasto', 0, 0, 1),
  ('521525', 'De valorización', 'Gasto', 0, 0, 1),
  ('521530', 'De turismo', 'Gasto', 0, 0, 1),
  ('521540', 'De vehículos', 'Gasto', 0, 0, 1),
  ('521545', 'De espectáculos públicos', 'Gasto', 0, 0, 1),
  ('521555', 'Licores', 'Gasto', 0, 0, 1),
  ('521560', 'Cervezas', 'Gasto', 0, 0, 1),
  ('521565', 'Cigarrillos', 'Gasto', 0, 0, 1),
  ('521570', 'IVA descontable', 'Gasto', 0, 0, 1),
  ('521595', 'Otros', 'Gasto', 0, 0, 1),
  ('5220', 'Arrendamientos', 'Gasto', 0, 0, 1),
  ('522010', 'Construcciones y edificaciones', 'Gasto', 0, 0, 1),
  ('522015', 'Maquinaria y equipo', 'Gasto', 0, 0, 1),
  ('522020', 'Equipo de oficina', 'Gasto', 0, 0, 1),
  ('522025', 'Equipo de computación y comunicación', 'Gasto', 0, 0, 1),
  ('522035', 'Equipo de hoteles y restaurantes', 'Gasto', 0, 0, 1),
  ('522040', 'Flota y equipo de transporte', 'Gasto', 0, 0, 1),
  ('522095', 'Otros', 'Gasto', 0, 0, 1),
  ('5225', 'Contribuciones y afiliaciones', 'Gasto', 0, 0, 1),
  ('522505', 'Contribuciones', 'Gasto', 0, 0, 1),
  ('522510', 'Afiliaciones y sostenimiento', 'Gasto', 0, 0, 1),
  ('5230', 'Seguros', 'Gasto', 0, 0, 1),
  ('523005', 'Manejo', 'Gasto', 0, 0, 1),
  ('523010', 'Cumplimiento', 'Gasto', 0, 0, 1),
  ('523025', 'Incendio', 'Gasto', 0, 0, 1),
  ('523030', 'Terremoto', 'Gasto', 0, 0, 1),
  ('523035', 'Sustracción y hurto', 'Gasto', 0, 0, 1),
  ('523040', 'Flota y equipo de transporte', 'Gasto', 0, 0, 1),
  ('523060', 'Responsabilidad civil y extracontractual', 'Gasto', 0, 0, 1),
  ('523075', 'Obligatorio accidente de tránsito', 'Gasto', 0, 0, 1),
  ('523080', 'Lucro cesante', 'Gasto', 0, 0, 1),
  ('523095', 'Otros', 'Gasto', 0, 0, 1),
  ('5235', 'Servicios', 'Gasto', 0, 0, 1),
  ('523505', 'Aseo y vigilancia', 'Gasto', 0, 0, 1),
  ('523510', 'Temporales', 'Gasto', 0, 0, 1),
  ('523515', 'Asistencia técnica', 'Gasto', 0, 0, 1),
  ('523520', 'Procesamiento electrónico de datos', 'Gasto', 0, 0, 1),
  ('523525', 'Acueducto y alcantarillado', 'Gasto', 0, 0, 1),
  ('523530', 'Energía eléctrica', 'Gasto', 0, 0, 1),
  ('523535', 'Teléfono (celulares)', 'Gasto', 0, 0, 1),
  ('523540', 'Correo, portes y telegramas', 'Gasto', 0, 0, 1),
  ('523545', 'Fax y télex (escáner)', 'Gasto', 0, 0, 1),
  ('523550', 'Transporte, fletes y acarreos', 'Gasto', 0, 0, 1),
  ('523555', 'Gas', 'Gasto', 0, 0, 1),
  ('523560', 'Publicidad, propaganda y promoción', 'Gasto', 0, 0, 1),
  ('523595', 'Otros', 'Gasto', 0, 0, 1),
  ('5240', 'Gastos legales', 'Gasto', 0, 0, 1),
  ('524005', 'Notariales', 'Gasto', 0, 0, 1),
  ('524010', 'Registro mercantil', 'Gasto', 0, 0, 1),
  ('524015', 'Trámites y licencias', 'Gasto', 0, 0, 1),
  ('524095', 'Otros', 'Gasto', 0, 0, 1),
  ('5245', 'Mantenimiento y reparaciones', 'Gasto', 0, 0, 1),
  ('524510', 'Construcciones y edificaciones', 'Gasto', 0, 0, 1),
  ('524515', 'Maquinaria y equipo', 'Gasto', 0, 0, 1),
  ('524520', 'Equipo de oficina', 'Gasto', 0, 0, 1),
  ('524525', 'Equipo de computación y comunicación', 'Gasto', 0, 0, 1),
  ('524535', 'Equipo de hoteles y restaurantes', 'Gasto', 0, 0, 1),
  ('524540', 'Flota y equipo de transporte', 'Gasto', 0, 0, 1),
  ('5250', 'Adecuación e instalación', 'Gasto', 0, 0, 1),
  ('525005', 'Instalaciones eléctricas', 'Gasto', 0, 0, 1),
  ('525010', 'Arreglos ornamentales', 'Gasto', 0, 0, 1),
  ('525015', 'Reparaciones locativas', 'Gasto', 0, 0, 1),
  ('525095', 'Otros', 'Gasto', 0, 0, 1),
  ('5255', 'Gastos de viaje', 'Gasto', 0, 0, 1),
  ('525505', 'Alojamiento y manutención', 'Gasto', 0, 0, 1),
  ('525515', 'Pasajes aéreos', 'Gasto', 0, 0, 1),
  ('525520', 'Pasajes terrestres', 'Gasto', 0, 0, 1),
  ('525525', 'Pasajes férreos', 'Gasto', 0, 0, 1),
  ('525595', 'Otros', 'Gasto', 0, 0, 1),
  ('5260', 'Depreciaciones', 'Gasto', 0, 0, 1),
  ('526005', 'Construcciones y edificaciones', 'Gasto', 0, 0, 1),
  ('526010', 'Maquinaria y equipo', 'Gasto', 0, 0, 1),
  ('526015', 'Equipo de oficina', 'Gasto', 0, 0, 1),
  ('526020', 'Equipo de computación y comunicación', 'Gasto', 0, 0, 1),
  ('526030', 'Equipo de hoteles y restaurantes', 'Gasto', 0, 0, 1),
  ('526035', 'Flota y equipo de transporte', 'Gasto', 0, 0, 1),
  ('5265', 'Amortizaciones', 'Gasto', 0, 0, 1),
  ('526510', 'Intangibles', 'Gasto', 0, 0, 1),
  ('526515', 'Cargos diferidos', 'Gasto', 0, 0, 1),
  ('526595', 'Otras', 'Gasto', 0, 0, 1),
  ('5295', 'Diversos', 'Gasto', 0, 0, 1),
  ('529505', 'Comisiones', 'Gasto', 0, 0, 1),
  ('529510', 'Libros, suscripciones, periódicos y revistas', 'Gasto', 0, 0, 1),
  ('529515', 'Música ambiental', 'Gasto', 0, 0, 1),
  ('529520', 'Gastos de representación y relaciones públicas', 'Gasto', 0, 0, 1),
  ('529525', 'Elementos de aseo y cafetería', 'Gasto', 0, 0, 1),
  ('529530', 'Útiles, papelería y fotocopias', 'Gasto', 0, 0, 1),
  ('529535', 'Combustibles y lubricantes', 'Gasto', 0, 0, 1),
  ('529545', 'Taxis y buses', 'Gasto', 0, 0, 1),
  ('529550', 'Estampillas', 'Gasto', 0, 0, 1),
  ('529555', 'Microfilmación (escáner)', 'Gasto', 0, 0, 1),
  ('529560', 'Casino y restaurante', 'Gasto', 0, 0, 1),
  ('529565', 'Parqueaderos', 'Gasto', 0, 0, 1),
  ('529570', 'Indemnización por daños a terceros', 'Gasto', 0, 0, 1),
  ('529595', 'Otros', 'Gasto', 0, 0, 1),
  ('5299', 'Provisiones', 'Gasto', 0, 0, 1),
  ('529905', 'Inversiones', 'Gasto', 0, 0, 1),
  ('529910', 'Deudores', 'Gasto', 0, 0, 1),
  ('529915', 'Inventarios', 'Gasto', 0, 0, 1),
  ('529920', 'Propiedades, planta y equipo', 'Gasto', 0, 0, 1),
  ('529995', 'Otros activos', 'Gasto', 0, 0, 1),
  ('53', 'No operacionales', 'Gasto', 0, 0, 1),
  ('5305', 'Financieros', 'Gasto', 0, 0, 1),
  ('530505', 'Gastos bancarios', 'Gasto', 0, 0, 1),
  ('530515', 'Comisiones', 'Gasto', 0, 0, 1),
  ('530520', 'Intereses', 'Gasto', 0, 0, 1),
  ('530525', 'Diferencia en cambio', 'Gasto', 0, 0, 1),
  ('530530', 'Gastos en negociación certificados de cambio', 'Gasto', 0, 0, 1),
  ('530535', 'Descuentos comerciales condicionados', 'Gasto', 0, 0, 1),
  ('530595', 'Otros', 'Gasto', 0, 0, 1),
  ('5310', 'Pérdida en venta y retiro de bienes', 'Gasto', 0, 0, 1),
  ('531005', 'Venta de inversiones', 'Gasto', 0, 0, 1),
  ('531010', 'Venta de cartera', 'Gasto', 0, 0, 1),
  ('531015', 'Venta de propiedades, planta y equipo', 'Gasto', 0, 0, 1),
  ('531020', 'Venta de intangibles', 'Gasto', 0, 0, 1),
  ('531025', 'Venta de otros activos', 'Gasto', 0, 0, 1),
  ('531030', 'Retiro de propiedades, planta y equipo', 'Gasto', 0, 0, 1),
  ('531035', 'Retiro de otros activos', 'Gasto', 0, 0, 1),
  ('531040', 'Pérdidas por siniestros', 'Gasto', 0, 0, 1),
  ('531095', 'Otros', 'Gasto', 0, 0, 1),
  ('5313', 'Pérdidas método de participación', 'Gasto', 0, 0, 1),
  ('531310', 'De sociedades limitadas y/o asimiladas', 'Gasto', 0, 0, 1),
  ('5315', 'Gastos extraordinarios', 'Gasto', 0, 0, 1),
  ('531505', 'Costas y procesos judiciales', 'Gasto', 0, 0, 1),
  ('531510', 'Actividades culturales y cívicas', 'Gasto', 0, 0, 1),
  ('531515', 'Costos y gastos de ejercicios anteriores', 'Gasto', 0, 0, 1),
  ('531520', 'Impuestos asumidos', 'Gasto', 0, 0, 1),
  ('531595', 'Otros', 'Gasto', 0, 0, 1),
  ('5395', 'Gastos diversos', 'Gasto', 0, 0, 1),
  ('539505', 'Demandas laborales', 'Gasto', 0, 0, 1),
  ('539510', 'Demandas por incumplimiento de contratos', 'Gasto', 0, 0, 1),
  ('539515', 'Indemnizaciones', 'Gasto', 0, 0, 1),
  ('539520', 'Multas, sanciones y litigios', 'Gasto', 0, 0, 1),
  ('539525', 'Donaciones', 'Gasto', 0, 0, 1),
  ('539530', 'Constitución de garantías', 'Gasto', 0, 0, 1),
  ('539535', 'Amortización de bienes entregados en comodato', 'Gasto', 0, 0, 1),
  ('539595', 'Otros', 'Gasto', 0, 0, 1),
  ('54', 'Impuesto de renta y complementarios', 'Gasto', 0, 0, 1),
  ('5405', 'Impuesto de renta y complementarios', 'Gasto', 0, 0, 1),
  ('540505', 'Impuesto de renta y complementarios', 'Gasto', 0, 0, 1),
  ('59', 'Ganancias y pérdidas', 'Gasto', 0, 0, 1),
  ('5905', 'Ganancias y pérdidas', 'Gasto', 0, 0, 1),
  ('590505', 'Ganancias y pérdidas', 'Gasto', 0, 0, 1),
  -- Costos
  ('6', 'Costos de ventas', 'Costo', 0, 0, 1),
  ('61', 'Costo de ventas y de prestación de servicios', 'Costo', 0, 0, 1),
  ('6140', 'Hoteles y restaurantes', 'Costo', 0, 0, 1),
  ('614005', 'Hotelería', 'Costo', 0, 0, 1),
  ('614015', 'Restaurantes', 'Costo', 0, 0, 1),
  ('614020', 'Bares y cantinas', 'Costo', 0, 0, 1),
  ('614095', 'Actividades conexas', 'Costo', 0, 0, 1),
  ('61409501', 'Servicio de lavandería', 'Costo', 0, 0, 1),
  ('61409502', 'Servicio de teléfono', 'Costo', 0, 0, 1),
  ('61409503', 'Servicio de internet', 'Costo', 0, 0, 1),
  ('61409504', 'Alquiler de salones', 'Costo', 0, 0, 1),
  ('61409505', 'Venta de cigarrillos', 'Costo', 0, 0, 1)
AS n ON DUPLICATE KEY UPDATE nombre = n.nombre, clase = n.clase, corriente = n.corriente, contraria = n.contraria, activa = n.activa;

-- ── 2. Cuentas viejas de SOGO: sus movimientos pasan a la cuenta de la hoja ──
UPDATE asiento_lineas SET cuenta_codigo = '520506' WHERE cuenta_codigo = '510506';
UPDATE asiento_lineas SET cuenta_codigo = '520515' WHERE cuenta_codigo = '510515';
UPDATE asiento_lineas SET cuenta_codigo = '520527' WHERE cuenta_codigo = '510527';
UPDATE asiento_lineas SET cuenta_codigo = '520548' WHERE cuenta_codigo = '510548';
UPDATE asiento_lineas SET cuenta_codigo = '520569' WHERE cuenta_codigo = '510568';
UPDATE asiento_lineas SET cuenta_codigo = '520530' WHERE cuenta_codigo = '510530';
UPDATE asiento_lineas SET cuenta_codigo = '521030' WHERE cuenta_codigo = '511025';
UPDATE asiento_lineas SET cuenta_codigo = '521505' WHERE cuenta_codigo = '511505';
UPDATE asiento_lineas SET cuenta_codigo = '523525' WHERE cuenta_codigo = '513525';
UPDATE asiento_lineas SET cuenta_codigo = '523530' WHERE cuenta_codigo = '513530';
UPDATE asiento_lineas SET cuenta_codigo = '523535' WHERE cuenta_codigo = '513535';
UPDATE asiento_lineas SET cuenta_codigo = '524510' WHERE cuenta_codigo = '514510';
UPDATE asiento_lineas SET cuenta_codigo = '524515' WHERE cuenta_codigo = '514525';
UPDATE asiento_lineas SET cuenta_codigo = '526005' WHERE cuenta_codigo = '516005';
UPDATE asiento_lineas SET cuenta_codigo = '526015' WHERE cuenta_codigo = '516015';
UPDATE asiento_lineas SET cuenta_codigo = '526030' WHERE cuenta_codigo = '516020';
UPDATE asiento_lineas SET cuenta_codigo = '529525' WHERE cuenta_codigo = '519525';
UPDATE asiento_lineas SET cuenta_codigo = '529530' WHERE cuenta_codigo = '519530';
UPDATE asiento_lineas SET cuenta_codigo = '523520' WHERE cuenta_codigo = '519595';
UPDATE asiento_lineas SET cuenta_codigo = '614015' WHERE cuenta_codigo = '613505';
-- 539520 tenía las pérdidas de inventario (en la hoja es Multas): pasan a 531095
UPDATE asiento_lineas l JOIN asientos a ON a.id = l.asiento_id SET l.cuenta_codigo = '531095'
 WHERE l.cuenta_codigo = '539520' AND a.origen = 'Inventarios';
DELETE FROM cuentas_puc WHERE codigo IN ('510506', '510515', '510527', '510548', '510568', '510530', '511025', '511505',
  '513525', '513530', '513535', '514510', '514525', '516005', '516015', '516020', '519525', '519530', '519595', '613505');

-- ── Comprobación ────────────────────────────────────────────────────
SELECT clase, COUNT(*) AS cuentas, SUM(activa) AS activas FROM cuentas_puc GROUP BY clase ORDER BY MIN(codigo);
SELECT cuenta_codigo, COUNT(*) AS lineas FROM asiento_lineas WHERE cuenta_codigo LIKE '51%' OR cuenta_codigo = '613505' GROUP BY cuenta_codigo;
