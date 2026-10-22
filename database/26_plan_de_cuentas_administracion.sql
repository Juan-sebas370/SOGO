-- =====================================================================
-- Plan de cuentas del contador · parte 3: gastos operacionales de
-- administración (grupo 51) (hojas escaneadas págs. 62 a 66)
--
--  · Carga las cuentas de las hojas. Las marcadas "NO" no se cargan:
--    511535 Tasa por utilización de puertos, 511545 De espectáculos
--    públicos, 512005 Terrenos, 513015 Corriente débil, 513020 Vida
--    colectiva, 513070 Rotura de maquinaria, 514505 Terrenos, 515510
--    Pasajes fluviales y/o marítimos, 516505 Vías de comunicación y
--    519575 Pólvora y similares.
--  · Las hojas empiezan en 510515: 51, 5105, 510503 y 510506 se cargan
--    igual que en el grupo 52 (520503 Salario integral, 520506 Sueldos).
--  · Notas a mano de la hoja: 513535 Teléfono (celulares y fijo), 513540
--    Correo (escáner), 513545 Fax y télex (internet), 519530 Útiles,
--    papelería y fotocopias (escáner), 519555 Microfilmación (escáner).
--  · No mueve asientos: lo que SOGO contabiliza solo (nómina, servicios,
--    depreciaciones...) sigue yendo al grupo 52 como dejó la parte 2 (18).
--
-- No borra movimientos. Solo toca tablas de Contabilidad: la web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 25.
-- Se puede volver a ejecutar sin problema.
-- =====================================================================
USE hotel_sebastian;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── 1. Cuentas de las hojas (crea o corrige nombre, clase y naturaleza) ──
--    (codigo, nombre, clase, corriente, contraria, activa)
INSERT INTO cuentas_puc (codigo, nombre, clase, corriente, contraria, activa) VALUES
  ('51', 'Operacionales de administración', 'Gasto', 0, 0, 1),
  ('5105', 'Gastos de personal', 'Gasto', 0, 0, 1),
  ('510503', 'Salario integral', 'Gasto', 0, 0, 1),
  ('510506', 'Sueldos', 'Gasto', 0, 0, 1),
  ('510515', 'Horas extras y recargos', 'Gasto', 0, 0, 1),
  ('510518', 'Comisiones', 'Gasto', 0, 0, 1),
  ('510521', 'Viáticos', 'Gasto', 0, 0, 1),
  ('510524', 'Incapacidades', 'Gasto', 0, 0, 1),
  ('510527', 'Auxilio de transporte', 'Gasto', 0, 0, 1),
  ('510530', 'Cesantías', 'Gasto', 0, 0, 1),
  ('510533', 'Intereses sobre cesantías', 'Gasto', 0, 0, 1),
  ('510536', 'Prima de servicios', 'Gasto', 0, 0, 1),
  ('510539', 'Vacaciones', 'Gasto', 0, 0, 1),
  ('510542', 'Primas extralegales', 'Gasto', 0, 0, 1),
  ('510545', 'Auxilios', 'Gasto', 0, 0, 1),
  ('510548', 'Bonificaciones', 'Gasto', 0, 0, 1),
  ('510551', 'Dotación y suministro a trabajadores', 'Gasto', 0, 0, 1),
  ('510554', 'Seguros', 'Gasto', 0, 0, 1),
  ('510557', 'Cuotas partes pensiones de jubilación', 'Gasto', 0, 0, 1),
  ('510558', 'Amortización cálculo actuarial pensiones de jubilación', 'Gasto', 0, 0, 1),
  ('510559', 'Pensiones de jubilación', 'Gasto', 0, 0, 1),
  ('510560', 'Indemnizaciones laborales', 'Gasto', 0, 0, 1),
  ('510561', 'Amortización bonos pensionales', 'Gasto', 0, 0, 1),
  ('510562', 'Amortización títulos pensionales', 'Gasto', 0, 0, 1),
  ('510563', 'Capacitación al personal', 'Gasto', 0, 0, 1),
  ('510566', 'Gastos deportivos y de recreación', 'Gasto', 0, 0, 1),
  ('510568', 'Aportes a administradoras de riesgos profesionales, ARP', 'Gasto', 0, 0, 1),
  ('510569', 'Aportes a entidades promotoras de salud, EPS', 'Gasto', 0, 0, 1),
  ('510570', 'Aportes a fondos de pensiones y/o cesantías', 'Gasto', 0, 0, 1),
  ('510572', 'Aportes cajas de compensación familiar', 'Gasto', 0, 0, 1),
  ('510575', 'Aportes ICBF', 'Gasto', 0, 0, 1),
  ('510578', 'SENA', 'Gasto', 0, 0, 1),
  ('510581', 'Aportes sindicales', 'Gasto', 0, 0, 1),
  ('510584', 'Gastos médicos y drogas', 'Gasto', 0, 0, 1),
  ('510595', 'Otros', 'Gasto', 0, 0, 1),
  ('5110', 'Honorarios', 'Gasto', 0, 0, 1),
  ('511005', 'Junta directiva', 'Gasto', 0, 0, 1),
  ('511010', 'Revisoría fiscal', 'Gasto', 0, 0, 1),
  ('511015', 'Auditoría externa', 'Gasto', 0, 0, 1),
  ('511020', 'Avalúos', 'Gasto', 0, 0, 1),
  ('511025', 'Asesoría jurídica', 'Gasto', 0, 0, 1),
  ('511030', 'Asesoría financiera', 'Gasto', 0, 0, 1),
  ('511035', 'Asesoría técnica', 'Gasto', 0, 0, 1),
  ('511095', 'Otros', 'Gasto', 0, 0, 1),
  ('5115', 'Impuestos', 'Gasto', 0, 0, 1),
  ('511505', 'Industria y comercio', 'Gasto', 0, 0, 1),
  ('511510', 'De timbres', 'Gasto', 0, 0, 1),
  ('511515', 'A la propiedad raíz', 'Gasto', 0, 0, 1),
  ('511520', 'Derechos sobre instrumentos públicos', 'Gasto', 0, 0, 1),
  ('511525', 'De valorización', 'Gasto', 0, 0, 1),
  ('511530', 'De turismo', 'Gasto', 0, 0, 1),
  ('511540', 'De vehículos', 'Gasto', 0, 0, 1),
  ('511550', 'Cuotas de fomento', 'Gasto', 0, 0, 1),
  ('511570', 'IVA descontable', 'Gasto', 0, 0, 1),
  ('511595', 'Otros', 'Gasto', 0, 0, 1),
  ('5120', 'Arrendamientos', 'Gasto', 0, 0, 1),
  ('512010', 'Construcciones y edificaciones', 'Gasto', 0, 0, 1),
  ('512015', 'Maquinaria y equipo', 'Gasto', 0, 0, 1),
  ('512020', 'Equipo de oficina', 'Gasto', 0, 0, 1),
  ('512025', 'Equipo de computación y comunicación', 'Gasto', 0, 0, 1),
  ('512035', 'Equipo de hoteles y restaurantes', 'Gasto', 0, 0, 1),
  ('512040', 'Flota y equipo de transporte', 'Gasto', 0, 0, 1),
  ('512095', 'Otros', 'Gasto', 0, 0, 1),
  ('5125', 'Contribuciones y afiliaciones', 'Gasto', 0, 0, 1),
  ('512505', 'Contribuciones', 'Gasto', 0, 0, 1),
  ('512510', 'Afiliaciones y sostenimiento', 'Gasto', 0, 0, 1),
  ('5130', 'Seguros', 'Gasto', 0, 0, 1),
  ('513005', 'Manejo', 'Gasto', 0, 0, 1),
  ('513010', 'Cumplimiento', 'Gasto', 0, 0, 1),
  ('513025', 'Incendio', 'Gasto', 0, 0, 1),
  ('513030', 'Terremoto', 'Gasto', 0, 0, 1),
  ('513035', 'Sustracción y hurto', 'Gasto', 0, 0, 1),
  ('513040', 'Flota y equipo de transporte', 'Gasto', 0, 0, 1),
  ('513060', 'Responsabilidad civil y extracontractual', 'Gasto', 0, 0, 1),
  ('513075', 'Obligatorio accidente de tránsito', 'Gasto', 0, 0, 1),
  ('513080', 'Lucro cesante', 'Gasto', 0, 0, 1),
  ('513095', 'Otros', 'Gasto', 0, 0, 1),
  ('5135', 'Servicios', 'Gasto', 0, 0, 1),
  ('513505', 'Aseo y vigilancia', 'Gasto', 0, 0, 1),
  ('513510', 'Temporales', 'Gasto', 0, 0, 1),
  ('513515', 'Asistencia técnica', 'Gasto', 0, 0, 1),
  ('513520', 'Procesamiento electrónico de datos', 'Gasto', 0, 0, 1),
  ('513525', 'Acueducto y alcantarillado', 'Gasto', 0, 0, 1),
  ('513530', 'Energía eléctrica', 'Gasto', 0, 0, 1),
  ('513535', 'Teléfono (celulares y fijo)', 'Gasto', 0, 0, 1),
  ('513540', 'Correo, portes y telegramas (escáner)', 'Gasto', 0, 0, 1),
  ('513545', 'Fax y télex (internet)', 'Gasto', 0, 0, 1),
  ('513550', 'Transporte, fletes y acarreos', 'Gasto', 0, 0, 1),
  ('513555', 'Gas', 'Gasto', 0, 0, 1),
  ('513595', 'Otros', 'Gasto', 0, 0, 1),
  ('5140', 'Gastos legales', 'Gasto', 0, 0, 1),
  ('514005', 'Notariales', 'Gasto', 0, 0, 1),
  ('514010', 'Registro mercantil', 'Gasto', 0, 0, 1),
  ('514015', 'Trámites y licencias', 'Gasto', 0, 0, 1),
  ('514095', 'Otros', 'Gasto', 0, 0, 1),
  ('5145', 'Mantenimiento y reparaciones', 'Gasto', 0, 0, 1),
  ('514510', 'Construcciones y edificaciones', 'Gasto', 0, 0, 1),
  ('514515', 'Maquinaria y equipo', 'Gasto', 0, 0, 1),
  ('514520', 'Equipo de oficina', 'Gasto', 0, 0, 1),
  ('514525', 'Equipo de computación y comunicación', 'Gasto', 0, 0, 1),
  ('514535', 'Equipo de hoteles y restaurantes', 'Gasto', 0, 0, 1),
  ('514540', 'Flota y equipo de transporte', 'Gasto', 0, 0, 1),
  ('5150', 'Adecuación e instalación', 'Gasto', 0, 0, 1),
  ('515005', 'Instalaciones eléctricas', 'Gasto', 0, 0, 1),
  ('515010', 'Arreglos ornamentales', 'Gasto', 0, 0, 1),
  ('515015', 'Reparaciones locativas', 'Gasto', 0, 0, 1),
  ('515095', 'Otros', 'Gasto', 0, 0, 1),
  ('5155', 'Gastos de viaje', 'Gasto', 0, 0, 1),
  ('515505', 'Alojamiento y manutención', 'Gasto', 0, 0, 1),
  ('515515', 'Pasajes aéreos', 'Gasto', 0, 0, 1),
  ('515520', 'Pasajes terrestres', 'Gasto', 0, 0, 1),
  ('515595', 'Otros', 'Gasto', 0, 0, 1),
  ('5160', 'Depreciaciones', 'Gasto', 0, 0, 1),
  ('516005', 'Construcciones y edificaciones', 'Gasto', 0, 0, 1),
  ('516010', 'Maquinaria y equipo', 'Gasto', 0, 0, 1),
  ('516015', 'Equipo de oficina', 'Gasto', 0, 0, 1),
  ('516020', 'Equipo de computación y comunicación', 'Gasto', 0, 0, 1),
  ('516030', 'Equipo de hoteles y restaurantes', 'Gasto', 0, 0, 1),
  ('516035', 'Flota y equipo de transporte', 'Gasto', 0, 0, 1),
  ('5165', 'Amortizaciones', 'Gasto', 0, 0, 1),
  ('516510', 'Intangibles', 'Gasto', 0, 0, 1),
  ('516515', 'Cargos diferidos', 'Gasto', 0, 0, 1),
  ('516595', 'Otras', 'Gasto', 0, 0, 1),
  ('5195', 'Diversos', 'Gasto', 0, 0, 1),
  ('519505', 'Comisiones', 'Gasto', 0, 0, 1),
  ('519510', 'Libros, suscripciones, periódicos y revistas', 'Gasto', 0, 0, 1),
  ('519515', 'Música ambiental', 'Gasto', 0, 0, 1),
  ('519520', 'Gastos de representación y relaciones públicas', 'Gasto', 0, 0, 1),
  ('519525', 'Elementos de aseo y cafetería', 'Gasto', 0, 0, 1),
  ('519530', 'Útiles, papelería y fotocopias (escáner)', 'Gasto', 0, 0, 1),
  ('519535', 'Combustibles y lubricantes', 'Gasto', 0, 0, 1),
  ('519545', 'Taxis y buses', 'Gasto', 0, 0, 1),
  ('519550', 'Estampillas', 'Gasto', 0, 0, 1),
  ('519555', 'Microfilmación (escáner)', 'Gasto', 0, 0, 1),
  ('519560', 'Casino y restaurante', 'Gasto', 0, 0, 1),
  ('519565', 'Parqueaderos', 'Gasto', 0, 0, 1),
  ('519570', 'Indemnización por daños a terceros', 'Gasto', 0, 0, 1),
  ('519595', 'Otros', 'Gasto', 0, 0, 1),
  ('5199', 'Provisiones', 'Gasto', 0, 0, 1),
  ('519905', 'Inversiones', 'Gasto', 0, 0, 1),
  ('519910', 'Deudores', 'Gasto', 0, 0, 1),
  ('519915', 'Propiedades, planta y equipo', 'Gasto', 0, 0, 1),
  ('519995', 'Otros activos', 'Gasto', 0, 0, 1),
  ('52', 'Operacionales de ventas', 'Gasto', 0, 0, 1)
AS n ON DUPLICATE KEY UPDATE nombre = n.nombre, clase = n.clase, corriente = n.corriente, contraria = n.contraria, activa = n.activa;

-- ── 2. Las marcadas "NO" no quedan en el plan (solo si no tienen movimientos) ──
DELETE FROM cuentas_puc
 WHERE codigo IN ('511535', '511545', '512005', '513015', '513020', '513070', '514505', '515510', '516505', '519575')
   AND codigo NOT IN (SELECT cuenta_codigo FROM (SELECT DISTINCT cuenta_codigo FROM asiento_lineas) AS usadas);

-- ── Comprobación ────────────────────────────────────────────────────
SELECT COUNT(*) AS cuentas_grupo_51 FROM cuentas_puc WHERE codigo LIKE '51%';
SELECT clase, COUNT(*) AS cuentas, SUM(activa) AS activas FROM cuentas_puc GROUP BY clase ORDER BY MIN(codigo);
