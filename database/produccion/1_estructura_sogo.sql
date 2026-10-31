-- GENERADO con database/generar-paquete-produccion.mjs: no editar a mano.
-- Agrega a la base de la página web las tablas y columnas de SOGO. Se ejecuta UNA vez, después de un respaldo.

-- ─────────────────────────────── 01_estructura_sogo.sql
-- =====================================================================
-- SOGO + Hospedaje Sebastián — ampliación de la base hotel_sebastian
-- =====================================================================
-- Reglas de este script:
--   * NO borra ni modifica ninguna columna que ya use la página web.
--     La página crea sus tablas con Hibernate (ddl-auto=update), así que
--     solo se AGREGAN columnas (todas opcionales o con valor por defecto)
--     y tablas nuevas. Las inserciones de la página siguen funcionando.
--   * Se ejecuta UNA sola vez, después de sacar un respaldo completo
--     (Server → Data Export → "Dump Structure and Data").
--   * Dinero en DECIMAL(14,2). Fechas con hora en DATETIME.
--
-- Cómo se reparten las tablas:
--   Compartidas con la web : habitaciones, reservas, reserva_habitaciones,
--                            pagos, metodos_pago, usuarios, empleados,
--                            contactos, paquetes, promociones
--   Nuevas (solo SOGO)     : el resto
-- =====================================================================

SET SQL_SAFE_UPDATES = 0;

-- =====================================================================
-- 1. NUMERACIÓN — consecutivos compartidos (RSV-2026-00125, FE-1048...)
-- =====================================================================
CREATE TABLE consecutivos (
  prefijo  VARCHAR(10) NOT NULL,          -- RSV, FE, NC, PED, ENT, SAL, AJU, CI, CE...
  anio     INT         NOT NULL DEFAULT 0, -- 0 = numeración continua (facturas DIAN)
  ultimo   INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (prefijo, anio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 2. CONFIGURACIÓN GENERAL (datos del emisor, TRA, política de
--    contraseñas, umbrales de alertas...) — un JSON por clave
-- =====================================================================
CREATE TABLE configuracion (
  clave               VARCHAR(60) NOT NULL,
  valor               JSON        NOT NULL,
  fecha_modificacion  DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  modificado_por      BIGINT      DEFAULT NULL,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 3. USUARIOS DEL PERSONAL, ROLES Y AUDITORÍA
--    `usuarios` ya existe (la usa el login de la web). Pasa a ser la
--    tabla de usuarios del personal: se le agregan los campos de SOGO.
-- =====================================================================
ALTER TABLE usuarios
  ADD COLUMN username                VARCHAR(60)  DEFAULT NULL,
  ADD COLUMN cargo                   VARCHAR(100) DEFAULT NULL,
  ADD COLUMN estado                  VARCHAR(20)  NOT NULL DEFAULT 'Activo',  -- Activo | Pendiente | Bloqueado | Inactivo
  ADD COLUMN intentos_fallidos       INT          NOT NULL DEFAULT 0,
  ADD COLUMN debe_cambiar_password   TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN password_actualizada_at DATETIME     DEFAULT NULL,
  ADD COLUMN ultima_ip               VARCHAR(45)  DEFAULT NULL,
  ADD COLUMN activacion_expira_at    DATETIME     DEFAULT NULL,
  ADD COLUMN proveedor_auth          VARCHAR(20)  NOT NULL DEFAULT 'local',   -- local | google | azure
  ADD COLUMN creado_por              BIGINT       DEFAULT NULL,
  ADD UNIQUE KEY uk_usuarios_username (username);

CREATE TABLE roles (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  nombre              VARCHAR(60)  NOT NULL,
  descripcion         VARCHAR(255) DEFAULT NULL,
  nivel               VARCHAR(20)  NOT NULL DEFAULT 'Operador',  -- Total | Operador | Consulta
  color               VARCHAR(20)  DEFAULT 'custom',
  rol_padre_id        BIGINT       DEFAULT NULL,                 -- hereda permisos de este rol
  bloqueado           TINYINT(1)   NOT NULL DEFAULT 0,           -- rol crítico (Administrador)
  fecha_modificacion  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  modificado_por      BIGINT       DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_roles_nombre (nombre),
  CONSTRAINT fk_roles_padre FOREIGN KEY (rol_padre_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Permisos por módulo (Reservas, Alojamiento, TRA, Facturación, ...)
CREATE TABLE rol_permisos (
  rol_id    BIGINT      NOT NULL,
  modulo    VARCHAR(30) NOT NULL,
  ver       TINYINT(1)  NOT NULL DEFAULT 0,
  crear     TINYINT(1)  NOT NULL DEFAULT 0,
  editar    TINYINT(1)  NOT NULL DEFAULT 0,
  eliminar  TINYINT(1)  NOT NULL DEFAULT 0,
  exportar  TINYINT(1)  NOT NULL DEFAULT 0,
  alcance   VARCHAR(100) DEFAULT NULL,        -- p. ej. "Solo su área"
  PRIMARY KEY (rol_id, modulo),
  CONSTRAINT fk_rol_permisos_rol FOREIGN KEY (rol_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE usuario_roles (
  usuario_id BIGINT NOT NULL,
  rol_id     BIGINT NOT NULL,
  PRIMARY KEY (usuario_id, rol_id),
  CONSTRAINT fk_usuario_roles_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_usuario_roles_rol     FOREIGN KEY (rol_id)     REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Bitácora encadenada: cada evento guarda el hash del anterior
CREATE TABLE auditoria (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  codigo       VARCHAR(30)  NOT NULL,              -- EVT-2026-0918342
  fecha        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id   BIGINT       DEFAULT NULL,
  username     VARCHAR(60)  DEFAULT NULL,
  ip           VARCHAR(45)  DEFAULT NULL,
  dispositivo  VARCHAR(150) DEFAULT NULL,
  modulo       VARCHAR(30)  NOT NULL,
  accion       VARCHAR(60)  NOT NULL,
  detalle      VARCHAR(500) DEFAULT NULL,
  objeto       VARCHAR(100) DEFAULT NULL,
  resultado    VARCHAR(15)  NOT NULL DEFAULT 'Exitoso',  -- Exitoso | Denegado | Fallido
  cambios      JSON         DEFAULT NULL,                -- [{label, before, after}]
  motivo       VARCHAR(255) DEFAULT NULL,
  hash         CHAR(64)     NOT NULL,
  hash_anterior CHAR(64)    DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_auditoria_codigo (codigo),
  KEY idx_auditoria_fecha (fecha),
  KEY idx_auditoria_modulo (modulo),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Historial de cambios de cualquier registro (producto, empleado, usuario,
-- plato del menú...). Reemplaza los arreglos `history` del frontend.
CREATE TABLE historial_cambios (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  entidad     VARCHAR(40)  NOT NULL,     -- 'producto_inventario', 'empleado', 'usuario', 'menu_producto'...
  entidad_id  BIGINT       NOT NULL,
  fecha       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id  BIGINT       DEFAULT NULL,
  campo       VARCHAR(60)  DEFAULT NULL,
  antes       VARCHAR(500) DEFAULT NULL,
  despues     VARCHAR(500) DEFAULT NULL,
  texto       VARCHAR(500) DEFAULT NULL, -- "Precio $ 40.000 → $ 42.000"
  motivo      VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_historial_entidad (entidad, entidad_id),
  CONSTRAINT fk_historial_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 4. TERCEROS — compradores de facturas, proveedores y terceros
--    contables en una sola tabla (un NIT = un registro)
-- =====================================================================
CREATE TABLE terceros (
  id                     BIGINT       NOT NULL AUTO_INCREMENT,
  tipo_persona           VARCHAR(10)  NOT NULL DEFAULT 'Natural',  -- Natural | Jurídica
  tipo_documento         VARCHAR(5)   NOT NULL,                    -- CC | CE | NIT | PA | TI
  numero_documento       VARCHAR(30)  NOT NULL,
  dv                     CHAR(1)      DEFAULT NULL,
  nombre                 VARCHAR(200) NOT NULL,                    -- nombre o razón social
  responsabilidad_fiscal VARCHAR(20)  DEFAULT 'R-99-PN',
  email                  VARCHAR(120) DEFAULT NULL,
  telefono               VARCHAR(30)  DEFAULT NULL,
  pais                   VARCHAR(60)  DEFAULT 'Colombia',
  departamento           VARCHAR(60)  DEFAULT NULL,
  ciudad                 VARCHAR(60)  DEFAULT NULL,
  direccion              VARCHAR(200) DEFAULT NULL,
  es_cliente             TINYINT(1)   NOT NULL DEFAULT 0,
  es_proveedor           TINYINT(1)   NOT NULL DEFAULT 0,
  activo                 TINYINT(1)   NOT NULL DEFAULT 1,
  fecha_creacion         DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_terceros_documento (tipo_documento, numero_documento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 5. EMPLEADOS Y NÓMINA
--    `empleados` ya existe (web). Se reutilizan: numero_empleado (EMP-001),
--    departamento (área), cargo, fecha_contratacion, fecha_terminacion
--    (retiro), salario (salario vigente), usuario_id (usuario vinculado).
-- =====================================================================
ALTER TABLE empleados
  ADD COLUMN tipo_documento     VARCHAR(10)  DEFAULT NULL,
  ADD COLUMN numero_documento   VARCHAR(30)  DEFAULT NULL,
  ADD COLUMN fecha_nacimiento   DATE         DEFAULT NULL,
  ADD COLUMN direccion          VARCHAR(200) DEFAULT NULL,
  ADD COLUMN estado             VARCHAR(20)  NOT NULL DEFAULT 'Activo',  -- Activo | Vacaciones | Retirado
  ADD COLUMN tipo_contrato      VARCHAR(30)  DEFAULT NULL,
  ADD COLUMN fin_contrato       DATE         DEFAULT NULL,
  ADD COLUMN horas_semanales    INT          DEFAULT NULL,               -- NULL = tiempo completo
  ADD COLUMN eps                VARCHAR(60)  DEFAULT NULL,
  ADD COLUMN fondo_pension      VARCHAR(60)  DEFAULT NULL,
  ADD COLUMN arl                VARCHAR(60)  DEFAULT NULL,
  ADD COLUMN riesgo_arl         VARCHAR(3)   DEFAULT 'I',
  ADD COLUMN caja_compensacion  VARCHAR(60)  DEFAULT NULL,
  ADD COLUMN banco              VARCHAR(60)  DEFAULT NULL,
  ADD COLUMN tipo_cuenta        VARCHAR(15)  DEFAULT NULL,               -- Ahorros | Corriente
  ADD COLUMN numero_cuenta      VARCHAR(30)  DEFAULT NULL,
  ADD UNIQUE KEY uk_empleados_numero (numero_empleado),
  ADD UNIQUE KEY uk_empleados_documento (tipo_documento, numero_documento);

-- Salario por vigencia: el que aplica a una fecha es el último con desde <= fecha
CREATE TABLE empleado_salarios (
  id           BIGINT        NOT NULL AUTO_INCREMENT,
  empleado_id  BIGINT        NOT NULL,
  desde        DATE          NOT NULL,
  monto        DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_empleado_salarios (empleado_id, desde),
  CONSTRAINT fk_empleado_salarios_empleado FOREIGN KEY (empleado_id) REFERENCES empleados (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Descuentos autorizados (préstamos, libranzas, embargos...)
CREATE TABLE empleado_deducciones (
  id            BIGINT        NOT NULL AUTO_INCREMENT,
  empleado_id   BIGINT        NOT NULL,
  tipo          VARCHAR(40)   NOT NULL,
  descripcion   VARCHAR(200)  DEFAULT NULL,
  monto         DECIMAL(14,2) NOT NULL,   -- por período
  cuotas        INT           DEFAULT NULL, -- NULL = hasta nueva orden
  desde_periodo CHAR(7)       NOT NULL,     -- YYYY-MM
  activa        TINYINT(1)    NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  CONSTRAINT fk_empleado_deducciones_empleado FOREIGN KEY (empleado_id) REFERENCES empleados (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Parámetros legales por año (SMMLV, auxilio de transporte, jornada...)
CREATE TABLE parametros_nomina (
  anio                 INT           NOT NULL,
  smmlv                DECIMAL(14,2) NOT NULL,
  auxilio_transporte   DECIMAL(14,2) NOT NULL,
  jornada_semanal      INT           NOT NULL,
  reglas               JSON          DEFAULT NULL,   -- recargos, tasas, provisiones
  PRIMARY KEY (anio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Una corrida de nómina por período
CREATE TABLE nominas (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  periodo          CHAR(7)      NOT NULL,          -- YYYY-MM
  fecha_pago       DATE         NOT NULL,
  estado           VARCHAR(15)  NOT NULL DEFAULT 'Borrador', -- Borrador | Confirmada | Pagada | Anulada
  creado_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por       BIGINT       DEFAULT NULL,
  confirmado_at    DATETIME     DEFAULT NULL,
  confirmado_por   BIGINT       DEFAULT NULL,
  pagado_at        DATETIME     DEFAULT NULL,
  pagado_por       BIGINT       DEFAULT NULL,
  anulado_at       DATETIME     DEFAULT NULL,
  anulado_por      BIGINT       DEFAULT NULL,
  motivo_anulacion VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_nominas_periodo (periodo),
  CONSTRAINT fk_nominas_creado     FOREIGN KEY (creado_por)     REFERENCES usuarios (id),
  CONSTRAINT fk_nominas_confirmado FOREIGN KEY (confirmado_por) REFERENCES usuarios (id),
  CONSTRAINT fk_nominas_pagado     FOREIGN KEY (pagado_por)     REFERENCES usuarios (id),
  CONSTRAINT fk_nominas_anulado    FOREIGN KEY (anulado_por)    REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Novedades del período (horas extra, recargos, bonificaciones)
CREATE TABLE nomina_novedades (
  nomina_id           BIGINT        NOT NULL,
  empleado_id         BIGINT        NOT NULL,
  extra_diurna        DECIMAL(6,2)  NOT NULL DEFAULT 0,
  extra_nocturna      DECIMAL(6,2)  NOT NULL DEFAULT 0,
  horas_nocturnas     DECIMAL(6,2)  NOT NULL DEFAULT 0,
  horas_dominicales   DECIMAL(6,2)  NOT NULL DEFAULT 0,
  bonificacion_salarial    DECIMAL(14,2) NOT NULL DEFAULT 0,
  bonificacion_no_salarial DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (nomina_id, empleado_id),
  CONSTRAINT fk_nomina_novedades_nomina   FOREIGN KEY (nomina_id)   REFERENCES nominas (id) ON DELETE CASCADE,
  CONSTRAINT fk_nomina_novedades_empleado FOREIGN KEY (empleado_id) REFERENCES empleados (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Liquidación de cada empleado (se congela al confirmar la nómina)
CREATE TABLE nomina_liquidaciones (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  nomina_id          BIGINT        NOT NULL,
  empleado_id        BIGINT        NOT NULL,
  dias               INT           NOT NULL,
  salario_base       DECIMAL(14,2) NOT NULL,
  total_devengado    DECIMAL(14,2) NOT NULL,
  total_deducciones  DECIMAL(14,2) NOT NULL,
  neto               DECIMAL(14,2) NOT NULL,
  aportes_empleador  DECIMAL(14,2) NOT NULL DEFAULT 0,
  provisiones        DECIMAL(14,2) NOT NULL DEFAULT 0,
  devengos           JSON          NOT NULL,   -- [{concept, detail, value, ibc, kind}]
  deducciones        JSON          NOT NULL,   -- [{concept, kind, calc, value}]
  es_correccion      TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_nomina_liq (nomina_id, empleado_id),
  CONSTRAINT fk_nomina_liq_nomina   FOREIGN KEY (nomina_id)   REFERENCES nominas (id) ON DELETE CASCADE,
  CONSTRAINT fk_nomina_liq_empleado FOREIGN KEY (empleado_id) REFERENCES empleados (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Comprobantes de pago (colillas)
CREATE TABLE comprobantes_pago (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  numero           VARCHAR(30)  NOT NULL,     -- CP-2026-09-003
  nomina_id        BIGINT       NOT NULL,
  empleado_id      BIGINT       NOT NULL,
  liquidacion_id   BIGINT       NOT NULL,
  generado_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generado_por     BIGINT       DEFAULT NULL,
  estado           VARCHAR(10)  NOT NULL DEFAULT 'Generado',  -- Generado | Anulado
  reemplazado_por  VARCHAR(30)  DEFAULT NULL,
  motivo           VARCHAR(255) DEFAULT NULL,
  enviado_a        VARCHAR(120) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_comprobantes_numero (numero),
  CONSTRAINT fk_comprobantes_nomina   FOREIGN KEY (nomina_id)      REFERENCES nominas (id),
  CONSTRAINT fk_comprobantes_empleado FOREIGN KEY (empleado_id)    REFERENCES empleados (id),
  CONSTRAINT fk_comprobantes_liq      FOREIGN KEY (liquidacion_id) REFERENCES nomina_liquidaciones (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 6. HABITACIONES Y ALOJAMIENTO
--    `habitaciones.estado` (web: DISPONIBLE | OCUPADA | MANTENIMIENTO)
--    guarda el estado MANUAL que pone el personal. Ocupada/Reservada se
--    calculan con las reservas. Así, si SOGO marca MANTENIMIENTO, la web
--    deja de mostrarla como disponible.
-- =====================================================================
ALTER TABLE habitaciones
  ADD COLUMN camas              VARCHAR(150) DEFAULT NULL,   -- "1 cama doble, 1 camarote"
  ADD COLUMN tipo_bano          VARCHAR(12)  DEFAULT 'Privado', -- Privado | Compartido
  ADD COLUMN comparte_bano_con  VARCHAR(10)  DEFAULT NULL,   -- número de la otra habitación
  ADD COLUMN activa             TINYINT(1)   NOT NULL DEFAULT 1,
  ADD UNIQUE KEY uk_habitaciones_numero (numero);

-- Cambios de estado (limpieza, mantenimiento, fuera de servicio)
CREATE TABLE habitacion_estados (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  habitacion_id  BIGINT       NOT NULL,
  estado         VARCHAR(30)  NOT NULL,
  desde          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hasta          DATETIME     DEFAULT NULL,
  nota           VARCHAR(255) DEFAULT NULL,
  usuario_id     BIGINT       DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_habitacion_estados (habitacion_id, desde),
  CONSTRAINT fk_habitacion_estados_hab     FOREIGN KEY (habitacion_id) REFERENCES habitaciones (id),
  CONSTRAINT fk_habitacion_estados_usuario FOREIGN KEY (usuario_id)    REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 7. HUÉSPEDES Y RESERVAS
-- =====================================================================
CREATE TABLE huespedes (
  id                      BIGINT       NOT NULL AUTO_INCREMENT,
  tipo_documento          VARCHAR(10)  NOT NULL,
  numero_documento        VARCHAR(30)  NOT NULL,
  nombres                 VARCHAR(120) NOT NULL,
  apellidos               VARCHAR(120) DEFAULT NULL,
  fecha_nacimiento        DATE         DEFAULT NULL,
  codigo_pais             VARCHAR(6)   DEFAULT NULL,   -- +57
  telefono                VARCHAR(30)  DEFAULT NULL,
  email                   VARCHAR(120) DEFAULT NULL,
  pais                    VARCHAR(60)  DEFAULT NULL,
  ciudad                  VARCHAR(80)  DEFAULT NULL,
  consentimiento_datos_at DATETIME     DEFAULT NULL,   -- Ley 1581
  fecha_creacion          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  fecha_modificacion      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_huespedes_documento (tipo_documento, numero_documento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Campos que SOGO necesita en la reserva. Se conservan los de la web:
--   nombre_huesped/apellido_huesped/... = copia del huésped principal
--   huespedes, ninos3, ninos10, ninos11 = personas (SOGO los mapea a adultos/niños/bebés)
--   estado: PENDIENTE | CONFIRMADA | CANCELADA | COMPLETADA | NO_PRESENTADA
ALTER TABLE reservas
  ADD COLUMN codigo                  VARCHAR(20)   DEFAULT NULL,        -- RSV-2026-00125 (lo llena el trigger)
  ADD COLUMN huesped_id              BIGINT        DEFAULT NULL,        -- lo llena el trigger
  ADD COLUMN canal                   VARCHAR(20)   NOT NULL DEFAULT 'Web', -- Web | Directo | Booking | Airbnb | Walk-in
  ADD COLUMN ciudad                  VARCHAR(80)   DEFAULT NULL,
  ADD COLUMN plan                    VARCHAR(80)   DEFAULT NULL,
  ADD COLUMN paquete_id              BIGINT        DEFAULT NULL,
  ADD COLUMN promocion_id            BIGINT        DEFAULT NULL,
  ADD COLUMN valor_extras            DECIMAL(14,2) NOT NULL DEFAULT 0,  -- servicios adicionales pactados
  ADD COLUMN checkin_at              DATETIME      DEFAULT NULL,        -- estadía real
  ADD COLUMN checkout_at             DATETIME      DEFAULT NULL,
  ADD COLUMN motivo_cancelacion      VARCHAR(255)  DEFAULT NULL,
  ADD COLUMN consentimiento_datos_at DATETIME      DEFAULT NULL,
  ADD COLUMN creado_por              BIGINT        DEFAULT NULL,        -- NULL = creada desde la web
  ADD UNIQUE KEY uk_reservas_codigo (codigo),
  ADD KEY idx_reservas_fechas (fecha_ingreso, fecha_salida),
  ADD KEY idx_reservas_estado (estado),
  ADD KEY idx_reservas_habitacion (habitacion_id);

-- Llaves en un ALTER aparte: si una falla, las columnas de arriba ya quedan
ALTER TABLE reservas
  ADD CONSTRAINT fk_reservas_huesped    FOREIGN KEY (huesped_id)    REFERENCES huespedes (id),
  ADD CONSTRAINT fk_reservas_paquete    FOREIGN KEY (paquete_id)    REFERENCES paquetes (id),
  ADD CONSTRAINT fk_reservas_promocion  FOREIGN KEY (promocion_id)  REFERENCES promociones (id),
  ADD CONSTRAINT fk_reservas_creado_por FOREIGN KEY (creado_por)    REFERENCES usuarios (id);

-- Las llaves de habitacion_id hacia habitaciones NO se crean aquí: si hay
-- reservas viejas que apuntan a habitaciones borradas, el ALTER falla.
-- Se agregan con la PARTE E de 01b_reparar_reservas.sql cuando los datos
-- estén limpios.

-- Todas las personas de la reserva (principal + acompañantes) con los
-- datos de viaje que pide la TRA
CREATE TABLE reserva_huespedes (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  reserva_id          BIGINT       NOT NULL,
  huesped_id          BIGINT       NOT NULL,
  rol                 VARCHAR(12)  NOT NULL DEFAULT 'ACOMPANANTE', -- PRINCIPAL | ACOMPANANTE
  parentesco          VARCHAR(30)  DEFAULT NULL,
  habitacion_id       BIGINT       DEFAULT NULL,          -- unidad donde se aloja
  pais_residencia     VARCHAR(10)  DEFAULT NULL,
  ciudad_residencia   VARCHAR(10)  DEFAULT NULL,
  pais_procedencia    VARCHAR(10)  DEFAULT NULL,
  ciudad_procedencia  VARCHAR(10)  DEFAULT NULL,
  motivo_viaje_id     INT          DEFAULT NULL,
  verificacion_menor  JSON         DEFAULT NULL,          -- {verified, travelsWith, support, verifiedBy, verifiedAt}
  PRIMARY KEY (id),
  UNIQUE KEY uk_reserva_huespedes (reserva_id, huesped_id),
  CONSTRAINT fk_reserva_huespedes_reserva FOREIGN KEY (reserva_id)    REFERENCES reservas (id) ON DELETE CASCADE,
  CONSTRAINT fk_reserva_huespedes_huesped FOREIGN KEY (huesped_id)    REFERENCES huespedes (id),
  CONSTRAINT fk_reserva_huespedes_hab     FOREIGN KEY (habitacion_id) REFERENCES habitaciones (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Consumos cargados a la estadía (restaurante, minibar, lavandería...).
-- Al facturar se convierten en líneas de factura.
CREATE TABLE consumos (
  id              BIGINT        NOT NULL AUTO_INCREMENT,
  reserva_id      BIGINT        NOT NULL,
  categoria       VARCHAR(30)   NOT NULL,   -- Alojamiento | Restaurante | Minibar | Lavandería | Eventos y pasadías | Otro
  descripcion     VARCHAR(200)  NOT NULL,
  detalle         VARCHAR(200)  DEFAULT NULL,
  fecha           DATE          NOT NULL,
  cantidad        DECIMAL(10,2) NOT NULL DEFAULT 1,
  valor_unitario  DECIMAL(14,2) NOT NULL,
  tipo_impuesto   VARCHAR(5)    NOT NULL DEFAULT 'IVA',  -- IVA | INC
  tarifa_impuesto DECIMAL(5,4)  NOT NULL DEFAULT 0,      -- 0.19, 0.08, 0
  origen          VARCHAR(20)   NOT NULL DEFAULT 'Manual', -- Manual | Restaurante | Inventarios
  factura_id      BIGINT        DEFAULT NULL,              -- se llena al facturar
  creado_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por      BIGINT        DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_consumos_reserva (reserva_id),
  CONSTRAINT fk_consumos_reserva FOREIGN KEY (reserva_id) REFERENCES reservas (id),
  CONSTRAINT fk_consumos_usuario FOREIGN KEY (creado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Pagos: la web los registra con Wompi; SOGO registra los de recepción.
ALTER TABLE pagos
  ADD COLUMN origen       VARCHAR(10)  NOT NULL DEFAULT 'Web',  -- Web | SOGO
  ADD COLUMN comprobante  VARCHAR(60)  DEFAULT NULL,            -- n.º de comprobante / recibo
  ADD COLUMN observacion  VARCHAR(255) DEFAULT NULL;

-- =====================================================================
-- 8. TRA — Tarjeta de Registro de Alojamiento (Res. 409 de 2022)
-- =====================================================================
CREATE TABLE tra_registros (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  reserva_id     BIGINT       NOT NULL,
  estado         VARCHAR(25)  NOT NULL DEFAULT 'BORRADOR',
                 -- BORRADOR | REQUIERE_CORRECCION | LISTA_PARA_ENVIO | ENVIANDO | REPORTADA | ERROR
  checkin_at     DATETIME     DEFAULT NULL,
  enviado_por    BIGINT       DEFAULT NULL,
  fecha_modificacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tra_reserva (reserva_id),
  CONSTRAINT fk_tra_reserva FOREIGN KEY (reserva_id)  REFERENCES reservas (id),
  CONSTRAINT fk_tra_usuario FOREIGN KEY (enviado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Unidades de alojamiento reportadas (numerales 3.1 a 3.3)
CREATE TABLE tra_unidades (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  tra_id             BIGINT        NOT NULL,
  unidad             VARCHAR(40)   NOT NULL,   -- "Hab. 201", "Piso 2", "Casa completa"
  tipo_alojamiento   VARCHAR(10)   NOT NULL,
  valor_total        DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_tra_unidades_tra FOREIGN KEY (tra_id) REFERENCES tra_registros (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Un envío por huésped al servicio del MinCIT
CREATE TABLE tra_envios (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  tra_id              BIGINT       NOT NULL,
  reserva_huesped_id  BIGINT       NOT NULL,
  endpoint            VARCHAR(5)   NOT NULL,          -- ONE (principal) | TWO (acompañante)
  estado              VARCHAR(12)  NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | ENVIANDO | EXITOSO | ERROR | REINTENTO
  intentos            INT          NOT NULL DEFAULT 0,
  intento_at          DATETIME     DEFAULT NULL,
  http_status         INT          DEFAULT NULL,
  request_id          VARCHAR(60)  DEFAULT NULL,
  mincit_id           VARCHAR(60)  DEFAULT NULL,
  mensaje             VARCHAR(500) DEFAULT NULL,
  duracion_ms         INT          DEFAULT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_tra_envios_tra     FOREIGN KEY (tra_id)             REFERENCES tra_registros (id) ON DELETE CASCADE,
  CONSTRAINT fk_tra_envios_huesped FOREIGN KEY (reserva_huesped_id) REFERENCES reserva_huespedes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tra_eventos (
  id       BIGINT       NOT NULL AUTO_INCREMENT,
  tra_id   BIGINT       NOT NULL,
  fecha    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  titulo   VARCHAR(120) NOT NULL,
  detalle  VARCHAR(500) DEFAULT NULL,
  tono     VARCHAR(10)  NOT NULL DEFAULT 'info',   -- ok | info | danger | muted
  PRIMARY KEY (id),
  CONSTRAINT fk_tra_eventos_tra FOREIGN KEY (tra_id) REFERENCES tra_registros (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 9. FACTURACIÓN ELECTRÓNICA
-- =====================================================================
CREATE TABLE facturas (
  id                   BIGINT       NOT NULL AUTO_INCREMENT,
  numero               VARCHAR(20)  DEFAULT NULL,        -- NULL en borrador; FE-1048 al emitir
  reserva_id           BIGINT       DEFAULT NULL,        -- NULL = venta directa del restaurante
  tercero_id           BIGINT       NOT NULL,            -- comprador
  facturar_a           VARCHAR(10)  NOT NULL DEFAULT 'Huésped', -- Huésped | Empresa
  comprador            JSON         NOT NULL,            -- copia de los datos del comprador al emitir
  forma_pago           VARCHAR(10)  NOT NULL DEFAULT 'Contado',  -- Contado | Crédito
  metodo_pago          VARCHAR(30)  DEFAULT NULL,
  fecha_vencimiento    DATE         NOT NULL,
  estado_dian          VARCHAR(15)  NOT NULL DEFAULT 'Borrador', -- Borrador | En validación | Aceptada | Rechazada
  emitida_at           DATETIME     DEFAULT NULL,
  validada_at          DATETIME     DEFAULT NULL,
  cufe                 VARCHAR(120) DEFAULT NULL,
  motivo_rechazo       VARCHAR(500) DEFAULT NULL,
  enviada_canal        VARCHAR(10)  DEFAULT NULL,        -- Correo | WhatsApp
  enviada_a            VARCHAR(120) DEFAULT NULL,
  enviada_at           DATETIME     DEFAULT NULL,
  nota_credito         VARCHAR(20)  DEFAULT NULL,        -- anulación
  motivo_anulacion     VARCHAR(255) DEFAULT NULL,
  anulada_at           DATETIME     DEFAULT NULL,
  creado_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por           BIGINT       DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_facturas_numero (numero),
  UNIQUE KEY uk_facturas_cufe (cufe),
  KEY idx_facturas_reserva (reserva_id),
  CONSTRAINT fk_facturas_reserva FOREIGN KEY (reserva_id) REFERENCES reservas (id),
  CONSTRAINT fk_facturas_tercero FOREIGN KEY (tercero_id) REFERENCES terceros (id),
  CONSTRAINT fk_facturas_usuario FOREIGN KEY (creado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE consumos
  ADD CONSTRAINT fk_consumos_factura FOREIGN KEY (factura_id) REFERENCES facturas (id);

CREATE TABLE factura_lineas (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  factura_id         BIGINT        NOT NULL,
  orden              INT           NOT NULL DEFAULT 0,
  categoria          VARCHAR(30)   NOT NULL,
  descripcion        VARCHAR(200)  NOT NULL,
  detalle            VARCHAR(200)  DEFAULT NULL,
  periodo            VARCHAR(30)   DEFAULT NULL,   -- "22–25/09"
  cantidad           DECIMAL(10,2) NOT NULL,
  unidad             VARCHAR(20)   DEFAULT NULL,   -- noches, und...
  valor_unitario     DECIMAL(14,2) NOT NULL,
  descuento_pct      DECIMAL(5,2)  NOT NULL DEFAULT 0,
  descuento_motivo   VARCHAR(60)   DEFAULT NULL,
  tipo_impuesto      VARCHAR(5)    NOT NULL DEFAULT 'IVA',
  tarifa_impuesto    DECIMAL(5,4)  NOT NULL DEFAULT 0,
  incluida           TINYINT(1)    NOT NULL DEFAULT 1,
  consumo_id         BIGINT        DEFAULT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_factura_lineas_factura FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE CASCADE,
  CONSTRAINT fk_factura_lineas_consumo FOREIGN KEY (consumo_id) REFERENCES consumos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE factura_eventos (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  factura_id  BIGINT       NOT NULL,
  fecha       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  titulo      VARCHAR(120) NOT NULL,
  detalle     VARCHAR(500) DEFAULT NULL,
  tono        VARCHAR(10)  NOT NULL DEFAULT 'info',
  PRIMARY KEY (id),
  CONSTRAINT fk_factura_eventos_factura FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 10. INVENTARIOS
-- =====================================================================
CREATE TABLE categorias_inventario (
  id       BIGINT      NOT NULL AUTO_INCREMENT,
  nombre   VARCHAR(60) NOT NULL,
  prefijo  VARCHAR(5)  NOT NULL,     -- ALI, BEB, ASE...
  PRIMARY KEY (id),
  UNIQUE KEY uk_categorias_inv_nombre (nombre),
  UNIQUE KEY uk_categorias_inv_prefijo (prefijo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE productos_inventario (
  id                   BIGINT        NOT NULL AUTO_INCREMENT,
  codigo               VARCHAR(20)   NOT NULL,          -- ALI-004
  nombre               VARCHAR(120)  NOT NULL,
  categoria_id         BIGINT        NOT NULL,
  descripcion          VARCHAR(255)  DEFAULT NULL,
  unidad               VARCHAR(20)   NOT NULL,
  existencias          DECIMAL(12,3) NOT NULL DEFAULT 0, -- solo cambia con movimientos
  stock_minimo         DECIMAL(12,3) NOT NULL DEFAULT 0,
  ubicacion            VARCHAR(60)   DEFAULT NULL,
  proveedor_id         BIGINT        DEFAULT NULL,
  costo_unitario       DECIMAL(14,2) NOT NULL DEFAULT 0, -- costo promedio ponderado
  precio_referencia    DECIMAL(14,2) DEFAULT NULL,       -- NULL = uso interno
  controla_vencimiento TINYINT(1)    NOT NULL DEFAULT 0,
  fecha_vencimiento    DATE          DEFAULT NULL,
  activo               TINYINT(1)    NOT NULL DEFAULT 1,
  fecha_creacion       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_productos_inv_codigo (codigo),
  CONSTRAINT fk_productos_inv_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_inventario (id),
  CONSTRAINT fk_productos_inv_proveedor FOREIGN KEY (proveedor_id) REFERENCES terceros (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE movimientos_inventario (
  id                 BIGINT       NOT NULL AUTO_INCREMENT,
  numero             VARCHAR(20)  NOT NULL,          -- ENT-2026-0184
  tipo               VARCHAR(10)  NOT NULL,          -- Inicial | Entrada | Salida | Ajuste
  motivo             VARCHAR(40)  NOT NULL,
  fecha              DATETIME     NOT NULL,
  usuario_id         BIGINT       DEFAULT NULL,
  proveedor_id       BIGINT       DEFAULT NULL,
  factura_proveedor  VARCHAR(40)  DEFAULT NULL,
  recibido_por       VARCHAR(120) DEFAULT NULL,
  area               VARCHAR(60)  DEFAULT NULL,
  entregado_a        VARCHAR(120) DEFAULT NULL,
  referencia         VARCHAR(60)  DEFAULT NULL,      -- p. ej. PED-2026-0345
  ubicacion          VARCHAR(60)  DEFAULT NULL,
  observaciones      VARCHAR(500) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_movimientos_inv_numero (numero),
  KEY idx_movimientos_inv_fecha (fecha),
  CONSTRAINT fk_movimientos_inv_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios (id),
  CONSTRAINT fk_movimientos_inv_proveedor FOREIGN KEY (proveedor_id) REFERENCES terceros (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE movimiento_inventario_lineas (
  id              BIGINT        NOT NULL AUTO_INCREMENT,
  movimiento_id   BIGINT        NOT NULL,
  producto_id     BIGINT        NOT NULL,
  cantidad        DECIMAL(12,3) NOT NULL,   -- con signo: + entra, − sale
  costo_unitario  DECIMAL(14,2) NOT NULL,
  existencia_antes   DECIMAL(12,3) NOT NULL,
  existencia_despues DECIMAL(12,3) NOT NULL,
  motivo          VARCHAR(40)   DEFAULT NULL,
  nota            VARCHAR(255)  DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_mov_lineas_producto (producto_id),
  CONSTRAINT fk_mov_lineas_movimiento FOREIGN KEY (movimiento_id) REFERENCES movimientos_inventario (id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_lineas_producto   FOREIGN KEY (producto_id)   REFERENCES productos_inventario (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE alertas_inventario (
  id                    BIGINT       NOT NULL AUTO_INCREMENT,
  tipo                  VARCHAR(15)  NOT NULL,     -- Agotado | Stock bajo | Por vencer
  producto_id           BIGINT       NOT NULL,
  prioridad             VARCHAR(5)   NOT NULL,     -- Alta | Media | Baja
  generada_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado                VARCHAR(10)  NOT NULL DEFAULT 'Activa',  -- Activa | Atendida
  atendida_at           DATETIME     DEFAULT NULL,
  atendida_por          BIGINT       DEFAULT NULL,
  referencia_atencion   VARCHAR(30)  DEFAULT NULL, -- movimiento que la resolvió o "Manual"
  compra_solicitada_at  DATETIME     DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_alertas_inv (producto_id, tipo, estado),
  CONSTRAINT fk_alertas_inv_producto FOREIGN KEY (producto_id)  REFERENCES productos_inventario (id),
  CONSTRAINT fk_alertas_inv_usuario  FOREIGN KEY (atendida_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 11. RESTAURANTE Y CAFETERÍA
-- =====================================================================
CREATE TABLE menu_productos (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  codigo             VARCHAR(20)   NOT NULL,           -- BEB-01
  nombre             VARCHAR(120)  NOT NULL,
  categoria          VARCHAR(20)   NOT NULL,           -- Bebidas | Desayunos | Almuerzos | Cenas | Postres | Snacks
  precio             DECIMAL(14,2) NOT NULL,           -- antes de INC
  descripcion        VARCHAR(255)  DEFAULT NULL,
  ingredientes       JSON          DEFAULT NULL,
  observaciones      VARCHAR(255)  DEFAULT NULL,       -- alérgenos
  disponible         TINYINT(1)    NOT NULL DEFAULT 1,
  existencias        INT           NOT NULL DEFAULT 0,
  stock_minimo       INT           NOT NULL DEFAULT 0,
  fecha_modificacion DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  modificado_por     BIGINT        DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_menu_codigo (codigo),
  CONSTRAINT fk_menu_usuario FOREIGN KEY (modificado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pedidos_restaurante (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  numero             VARCHAR(20)   NOT NULL,           -- PED-2026-0345
  fecha              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por         BIGINT        DEFAULT NULL,
  destino            VARCHAR(15)   NOT NULL,           -- Huésped | Habitación | Venta directa
  mesa               VARCHAR(20)   DEFAULT NULL,
  cliente_nombre     VARCHAR(120)  DEFAULT NULL,
  cliente_documento  VARCHAR(30)   DEFAULT NULL,
  reserva_id         BIGINT        DEFAULT NULL,       -- cargo a una estadía activa
  unidad             VARCHAR(30)   DEFAULT NULL,       -- "Hab. 204", "Piso 1"
  observaciones      VARCHAR(255)  DEFAULT NULL,
  tarifa_inc         DECIMAL(5,4)  NOT NULL DEFAULT 0.08,
  estado             VARCHAR(10)   NOT NULL DEFAULT 'Pendiente', -- Pendiente | Facturada | Pagada | Anulada
  consumo_id         BIGINT        DEFAULT NULL,
  factura_id         BIGINT        DEFAULT NULL,
  metodo_pago        VARCHAR(30)   DEFAULT NULL,
  cerrado_at         DATETIME      DEFAULT NULL,
  cerrado_por        BIGINT        DEFAULT NULL,
  anulado_at         DATETIME      DEFAULT NULL,
  anulado_por        BIGINT        DEFAULT NULL,
  motivo_anulacion   VARCHAR(255)  DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pedidos_numero (numero),
  KEY idx_pedidos_fecha (fecha),
  CONSTRAINT fk_pedidos_reserva FOREIGN KEY (reserva_id)  REFERENCES reservas (id),
  CONSTRAINT fk_pedidos_consumo FOREIGN KEY (consumo_id)  REFERENCES consumos (id),
  CONSTRAINT fk_pedidos_factura FOREIGN KEY (factura_id)  REFERENCES facturas (id),
  CONSTRAINT fk_pedidos_creado  FOREIGN KEY (creado_por)  REFERENCES usuarios (id),
  CONSTRAINT fk_pedidos_cerrado FOREIGN KEY (cerrado_por) REFERENCES usuarios (id),
  CONSTRAINT fk_pedidos_anulado FOREIGN KEY (anulado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cada ítem guarda el precio con el que se vendió
CREATE TABLE pedido_restaurante_items (
  id               BIGINT        NOT NULL AUTO_INCREMENT,
  pedido_id        BIGINT        NOT NULL,
  menu_producto_id BIGINT        NOT NULL,
  nombre           VARCHAR(120)  NOT NULL,
  categoria        VARCHAR(20)   NOT NULL,
  precio_unitario  DECIMAL(14,2) NOT NULL,
  cantidad         INT           NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_pedido_items_pedido  FOREIGN KEY (pedido_id)        REFERENCES pedidos_restaurante (id) ON DELETE CASCADE,
  CONSTRAINT fk_pedido_items_menu    FOREIGN KEY (menu_producto_id) REFERENCES menu_productos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 12. CONTABILIDAD (PUC)
-- =====================================================================
CREATE TABLE cuentas_puc (
  codigo      VARCHAR(10)  NOT NULL,       -- 110505
  nombre      VARCHAR(150) NOT NULL,
  clase       VARCHAR(12)  NOT NULL,       -- Activo | Pasivo | Patrimonio | Ingreso | Gasto | Costo
  corriente   TINYINT(1)   NOT NULL DEFAULT 0,
  contraria   TINYINT(1)   NOT NULL DEFAULT 0,  -- naturaleza contraria (depreciación acumulada)
  activa      TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE asientos (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  numero            VARCHAR(20)  NOT NULL,          -- CI-2026-0413
  tipo              VARCHAR(12)  NOT NULL,          -- Ingreso | Egreso | Ajuste | Provisión | Pago | Cobro | Traslado | Causación | Venta | Apertura
  fecha             DATE         NOT NULL,
  hora              TIME         DEFAULT NULL,
  concepto          VARCHAR(255) NOT NULL,
  tercero_id        BIGINT       DEFAULT NULL,
  tercero_nombre    VARCHAR(200) DEFAULT NULL,
  categoria         VARCHAR(60)  DEFAULT NULL,
  metodo_pago       VARCHAR(30)  DEFAULT NULL,
  origen            VARCHAR(15)  NOT NULL DEFAULT 'Manual', -- Manual | Reservas | Alojamiento | Facturación | Restaurante | Nómina | Inventarios | Migración
  origen_clave      VARCHAR(80)  DEFAULT NULL,       -- evita contabilizar dos veces el mismo documento
  origen_ref        VARCHAR(40)  DEFAULT NULL,       -- "PED-2026-0345", "FE-1052"
  estado            VARCHAR(15)  NOT NULL DEFAULT 'Borrador', -- Borrador | Provisional | Contabilizado | Anulado
  observaciones     VARCHAR(500) DEFAULT NULL,
  creado_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por        BIGINT       DEFAULT NULL,
  anulado_at        DATETIME     DEFAULT NULL,
  anulado_por       BIGINT       DEFAULT NULL,
  motivo_anulacion  VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_asientos_numero (numero),
  UNIQUE KEY uk_asientos_origen (origen_clave),
  KEY idx_asientos_fecha (fecha),
  CONSTRAINT fk_asientos_tercero FOREIGN KEY (tercero_id)  REFERENCES terceros (id),
  CONSTRAINT fk_asientos_creado  FOREIGN KEY (creado_por)  REFERENCES usuarios (id),
  CONSTRAINT fk_asientos_anulado FOREIGN KEY (anulado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE asiento_lineas (
  id             BIGINT        NOT NULL AUTO_INCREMENT,
  asiento_id     BIGINT        NOT NULL,
  cuenta_codigo  VARCHAR(10)   NOT NULL,
  detalle        VARCHAR(255)  DEFAULT NULL,
  tercero        VARCHAR(200)  DEFAULT NULL,
  debito         DECIMAL(14,2) NOT NULL DEFAULT 0,
  credito        DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_asiento_lineas_cuenta (cuenta_codigo),
  CONSTRAINT fk_asiento_lineas_asiento FOREIGN KEY (asiento_id)    REFERENCES asientos (id) ON DELETE CASCADE,
  CONSTRAINT fk_asiento_lineas_cuenta  FOREIGN KEY (cuenta_codigo) REFERENCES cuentas_puc (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Documentos soporte (nombre del archivo guardado en el servidor)
CREATE TABLE asiento_soportes (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  asiento_id  BIGINT       NOT NULL,
  archivo     VARCHAR(255) NOT NULL,
  subido_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_asiento_soportes_asiento FOREIGN KEY (asiento_id) REFERENCES asientos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 13. REPORTES AUTOMÁTICOS
-- =====================================================================
CREATE TABLE reportes_programados (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  nombre           VARCHAR(120) NOT NULL,
  reporte          VARCHAR(30)  NOT NULL,     -- General | Ocupación | Reservas | Financieros | ...
  frecuencia       VARCHAR(10)  NOT NULL,     -- Diaria | Semanal | Mensual
  dia_semana       TINYINT      DEFAULT NULL, -- 0 = domingo
  dia_mes          TINYINT      DEFAULT NULL,
  hora             TIME         NOT NULL,
  cobertura        VARCHAR(40)  NOT NULL,
  formato          VARCHAR(5)   NOT NULL,     -- PDF | Excel | CSV
  destinatarios    JSON         NOT NULL,
  asunto           VARCHAR(200) DEFAULT NULL,
  avisar_si_falla  TINYINT(1)   NOT NULL DEFAULT 1,
  activo           TINYINT(1)   NOT NULL DEFAULT 1,
  pausado_at       DATETIME     DEFAULT NULL,
  creado_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por       BIGINT       DEFAULT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_reportes_prog_usuario FOREIGN KEY (creado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE reportes_ejecuciones (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  programado_id   BIGINT       NOT NULL,
  fecha           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  periodo         VARCHAR(40)  NOT NULL,
  formato         VARCHAR(5)   NOT NULL,
  entregas        JSON         NOT NULL,     -- [{email, ok, reason}]
  paginas         INT          DEFAULT NULL,
  es_prueba       TINYINT(1)   NOT NULL DEFAULT 0,
  reintento_de    BIGINT       DEFAULT NULL,
  nota            VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_reportes_ejec_prog FOREIGN KEY (programado_id) REFERENCES reportes_programados (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 14. SINCRONIZACIÓN AUTOMÁTICA CON LA WEB (triggers)
--    Cuando la página web guarda una reserva, MySQL mismo:
--      a) le asigna el código RSV-AAAA-NNNNN,
--      b) crea o actualiza el huésped en `huespedes`,
--      c) lo registra como huésped PRINCIPAL de la reserva.
--    Así SOGO ve la reserva completa sin tocar el código de la web.
-- =====================================================================
DELIMITER $$

CREATE TRIGGER trg_reservas_before_insert
BEFORE INSERT ON reservas
FOR EACH ROW
BEGIN
  DECLARE v_anio INT DEFAULT YEAR(COALESCE(NEW.fecha_creacion, NOW()));
  DECLARE v_num  INT;

  IF NEW.codigo IS NULL THEN
    INSERT IGNORE INTO consecutivos (prefijo, anio, ultimo) VALUES ('RSV', v_anio, 0);
    UPDATE consecutivos SET ultimo = ultimo + 1 WHERE prefijo = 'RSV' AND anio = v_anio;
    SELECT ultimo INTO v_num FROM consecutivos WHERE prefijo = 'RSV' AND anio = v_anio;
    SET NEW.codigo = CONCAT('RSV-', v_anio, '-', LPAD(v_num, 5, '0'));
  END IF;

  IF NEW.huesped_id IS NULL AND NEW.numero_documento IS NOT NULL AND NEW.numero_documento <> '' THEN
    INSERT INTO huespedes (tipo_documento, numero_documento, nombres, apellidos,
                           codigo_pais, telefono, email, pais, ciudad)
    VALUES (COALESCE(NEW.tipo_documento, 'CC'), NEW.numero_documento,
            COALESCE(NEW.nombre_huesped, 'Sin nombre'), NEW.apellido_huesped,
            NULLIF(NEW.codigo_pais, ''), NULLIF(NEW.telefono_contacto, ''), NULLIF(NEW.email_contacto, ''),
            NULLIF(NEW.pais, ''), NULLIF(NEW.ciudad, ''))
    ON DUPLICATE KEY UPDATE
      nombres     = VALUES(nombres),
      apellidos   = COALESCE(VALUES(apellidos), apellidos),
      codigo_pais = COALESCE(VALUES(codigo_pais), codigo_pais),
      telefono    = COALESCE(VALUES(telefono), telefono),
      email       = COALESCE(VALUES(email), email),
      pais        = COALESCE(VALUES(pais), pais),
      ciudad      = COALESCE(VALUES(ciudad), ciudad);
    SET NEW.huesped_id = (SELECT id FROM huespedes
                           WHERE tipo_documento = COALESCE(NEW.tipo_documento, 'CC')
                             AND numero_documento = NEW.numero_documento);
  END IF;
END$$

CREATE TRIGGER trg_reservas_after_insert
AFTER INSERT ON reservas
FOR EACH ROW
BEGIN
  IF NEW.huesped_id IS NOT NULL THEN
    INSERT IGNORE INTO reserva_huespedes (reserva_id, huesped_id, rol, habitacion_id)
    VALUES (NEW.id, NEW.huesped_id, 'PRINCIPAL',
            (SELECT id FROM habitaciones WHERE id = NEW.habitacion_id));
  END IF;
END$$

DELIMITER ;

-- =====================================================================
-- 15. COMPLETAR LOS DATOS QUE YA EXISTÍAN
-- =====================================================================
-- Huéspedes a partir de las reservas actuales
INSERT INTO huespedes (tipo_documento, numero_documento, nombres, apellidos,
                       codigo_pais, telefono, email, pais)
SELECT COALESCE(r.tipo_documento, 'CC'), r.numero_documento,
       COALESCE(MAX(r.nombre_huesped), 'Sin nombre'), MAX(r.apellido_huesped),
       MAX(r.codigo_pais), MAX(r.telefono_contacto), MAX(r.email_contacto), MAX(r.pais)
FROM reservas r
WHERE r.numero_documento IS NOT NULL AND r.numero_documento <> ''
GROUP BY COALESCE(r.tipo_documento, 'CC'), r.numero_documento
ON DUPLICATE KEY UPDATE nombres = VALUES(nombres);

UPDATE reservas r
JOIN huespedes h ON h.tipo_documento = COALESCE(r.tipo_documento, 'CC')
                AND h.numero_documento = r.numero_documento
SET r.huesped_id = h.id
WHERE r.huesped_id IS NULL;

INSERT IGNORE INTO reserva_huespedes (reserva_id, huesped_id, rol, habitacion_id)
SELECT r.id, r.huesped_id, 'PRINCIPAL', h.id
FROM reservas r LEFT JOIN habitaciones h ON h.id = r.habitacion_id
WHERE r.huesped_id IS NOT NULL;

-- Códigos para las reservas existentes (por año de creación)
UPDATE reservas r
JOIN (
  SELECT id,
         YEAR(COALESCE(fecha_creacion, NOW())) AS anio,
         ROW_NUMBER() OVER (PARTITION BY YEAR(COALESCE(fecha_creacion, NOW())) ORDER BY id) AS n
  FROM reservas
) x ON x.id = r.id
SET r.codigo = CONCAT('RSV-', x.anio, '-', LPAD(x.n, 5, '0'))
WHERE r.codigo IS NULL;

INSERT INTO consecutivos (prefijo, anio, ultimo)
SELECT 'RSV', YEAR(COALESCE(fecha_creacion, NOW())), COUNT(*)
FROM reservas GROUP BY YEAR(COALESCE(fecha_creacion, NOW()))
ON DUPLICATE KEY UPDATE ultimo = VALUES(ultimo);

SET SQL_SAFE_UPDATES = 1;


-- ─────────────────────────────── 01c_triggers_reservas.sql
-- =====================================================================
-- Triggers de sincronización con la web.
-- Ejecuta este archivo COMPLETO: sin seleccionar nada, pulsa el rayo
-- (Query → Execute All, Ctrl+Shift+Enter). Se puede repetir sin problema.
-- =====================================================================

DROP TRIGGER IF EXISTS trg_reservas_before_insert;
DROP TRIGGER IF EXISTS trg_reservas_after_insert;

DELIMITER $$

CREATE TRIGGER trg_reservas_before_insert
BEFORE INSERT ON reservas
FOR EACH ROW
BEGIN
  DECLARE v_anio INT DEFAULT YEAR(COALESCE(NEW.fecha_creacion, NOW()));
  DECLARE v_num  INT;

  IF NEW.codigo IS NULL THEN
    INSERT IGNORE INTO consecutivos (prefijo, anio, ultimo) VALUES ('RSV', v_anio, 0);
    UPDATE consecutivos SET ultimo = ultimo + 1 WHERE prefijo = 'RSV' AND anio = v_anio;
    SELECT ultimo INTO v_num FROM consecutivos WHERE prefijo = 'RSV' AND anio = v_anio;
    SET NEW.codigo = CONCAT('RSV-', v_anio, '-', LPAD(v_num, 5, '0'));
  END IF;

  IF NEW.huesped_id IS NULL AND NEW.numero_documento IS NOT NULL AND NEW.numero_documento <> '' THEN
    INSERT INTO huespedes (tipo_documento, numero_documento, nombres, apellidos,
                           codigo_pais, telefono, email, pais, ciudad)
    VALUES (COALESCE(NEW.tipo_documento, 'CC'), NEW.numero_documento,
            COALESCE(NEW.nombre_huesped, 'Sin nombre'), NEW.apellido_huesped,
            NULLIF(NEW.codigo_pais, ''), NULLIF(NEW.telefono_contacto, ''), NULLIF(NEW.email_contacto, ''),
            NULLIF(NEW.pais, ''), NULLIF(NEW.ciudad, ''))
    ON DUPLICATE KEY UPDATE
      nombres     = VALUES(nombres),
      apellidos   = COALESCE(VALUES(apellidos), apellidos),
      codigo_pais = COALESCE(VALUES(codigo_pais), codigo_pais),
      telefono    = COALESCE(VALUES(telefono), telefono),
      email       = COALESCE(VALUES(email), email),
      pais        = COALESCE(VALUES(pais), pais),
      ciudad      = COALESCE(VALUES(ciudad), ciudad);
    SET NEW.huesped_id = (SELECT id FROM huespedes
                           WHERE tipo_documento = COALESCE(NEW.tipo_documento, 'CC')
                             AND numero_documento = NEW.numero_documento);
  END IF;
END$$

CREATE TRIGGER trg_reservas_after_insert
AFTER INSERT ON reservas
FOR EACH ROW
BEGIN
  IF NEW.huesped_id IS NOT NULL THEN
    INSERT IGNORE INTO reserva_huespedes (reserva_id, huesped_id, rol, habitacion_id)
    VALUES (NEW.id, NEW.huesped_id, 'PRINCIPAL',
            (SELECT id FROM habitaciones WHERE id = NEW.habitacion_id));
  END IF;
END$$

DELIMITER ;

SHOW TRIGGERS WHERE `Table` = 'reservas';


-- ─────────────────────────────── 01e_pagos_sin_usuario.sql
-- =====================================================================
-- Pagos desde la web sin usuario.
-- La página no tiene login de clientes y nunca llena pagos.usuario_id,
-- pero la columna quedó NOT NULL de una versión anterior del código:
-- MySQL rechazaba TODOS los pagos de Wompi ("Column 'usuario_id' cannot
-- be null"). La entidad Pago de la web ya la declara opcional; aquí se
-- ajusta la tabla para que coincida. La llave foránea a usuarios se
-- conserva (SOGO sí llenará usuario_id con quien registra el pago).
-- =====================================================================

ALTER TABLE pagos MODIFY usuario_id BIGINT NULL;

-- Verificación: IS_NULLABLE debe decir YES
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'pagos' AND column_name = 'usuario_id';


-- ─────────────────────────────── 02_datos_iniciales.sql
-- =====================================================================
-- Datos iniciales que SOGO necesita para arrancar.
-- Ejecutar después de 01_estructura_sogo.sql. Se puede repetir sin
-- duplicar nada (INSERT IGNORE / ON DUPLICATE KEY).
-- =====================================================================

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


-- ─────────────────────────────── 04_datos_habitaciones.sql
-- =====================================================================
-- Datos físicos de las 7 habitaciones (camas y baño), tomados del
-- catálogo de la casa de SOGO (frontend/src/app/lodging/house.ts).
-- La columna tipo_bano se creó con 'Privado' por defecto, así que hoy
-- TODAS aparecen con baño privado. NO cambia precios ni descripciones
-- (esos los muestra la página web). Se puede ejecutar más de una vez.
-- =====================================================================

SET SQL_SAFE_UPDATES = 0;

UPDATE habitaciones h
JOIN (
  SELECT '101' AS numero, 'Familiar' AS tipo, 4 AS capacidad, '1 cama doble, 1 camarote' AS camas, 'Privado' AS tipo_bano, NULL AS comparte UNION ALL
  SELECT '102', 'Doble',    2, '1 cama doble',             'Compartido', '103' UNION ALL
  SELECT '103', 'Doble',    2, '1 cama doble',             'Compartido', '102' UNION ALL
  SELECT '201', 'Familiar', 4, '1 cama doble, 1 camarote', 'Privado',    NULL  UNION ALL
  SELECT '202', 'Doble',    2, '1 cama doble',             'Compartido', '203' UNION ALL
  SELECT '203', 'Doble',    2, '1 cama doble',             'Compartido', '202' UNION ALL
  SELECT '204', 'Familiar', 4, '1 cama doble, 1 camarote', 'Privado',    NULL
) d ON d.numero = h.numero
SET h.camas             = d.camas,
    h.tipo_bano         = d.tipo_bano,
    h.comparte_bano_con = d.comparte,
    h.bano              = (d.tipo_bano = 'Privado'),
    h.tipo              = COALESCE(NULLIF(h.tipo, ''), d.tipo),
    h.capacidad         = COALESCE(h.capacidad, d.capacidad);

SET SQL_SAFE_UPDATES = 1;

-- Verificación
SELECT numero, piso, tipo, capacidad, camas, tipo_bano, comparte_bano_con, precio_noche, estado
FROM habitaciones ORDER BY numero;





-- ─────────────────────────────── 06_dotacion_casa.sql
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


-- ─────────────────────────────── 07_usuarios_empleados_nomina.sql
-- =====================================================================
-- Usuarios, roles, auditoría, empleados y nómina de SOGO en la base de
-- datos (antes vivían en memoria y se reiniciaban al recargar).
--
-- `clave` = identificador estable que usa la aplicación (u…, e…, admin,
-- recep…). Los datos propios de SOGO sin columna dedicada (historial de
-- cambios, desactivación programada…) van en `sogo_datos` (JSON).
-- Solo se AGREGAN columnas opcionales: la página web sigue igual.
--
-- Ejecutar una vez, completo (rayo sin seleccionar nada).
-- =====================================================================

SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── Usuarios ────────────────────────────────────────────────────────
ALTER TABLE usuarios
  ADD COLUMN clave      VARCHAR(40) DEFAULT NULL,
  ADD COLUMN sogo_datos JSON        DEFAULT NULL,
  ADD UNIQUE KEY uk_usuarios_clave (clave);

-- Prefijo w (filas creadas por la web o antes de SOGO): no choca con las claves u… de SOGO
UPDATE usuarios SET clave = CONCAT('w', id) WHERE clave IS NULL;

-- ── Roles ───────────────────────────────────────────────────────────
ALTER TABLE roles
  ADD COLUMN clave VARCHAR(40) DEFAULT NULL,
  ADD UNIQUE KEY uk_roles_clave (clave);

UPDATE roles SET clave = CASE nombre
    WHEN 'Administrador'            THEN 'admin'
    WHEN 'Consulta'                 THEN 'consulta'
    WHEN 'Recepcionista'            THEN 'recep'
    WHEN 'Operador Restaurante'     THEN 'rest'
    WHEN 'Operador Alojamiento'     THEN 'aloj'
    WHEN 'Contador'                 THEN 'cont'
    WHEN 'Aux. Nómina e Inventario' THEN 'aux'
    ELSE CONCAT('r', id) END
WHERE clave IS NULL;

-- ── Historial de estados, restablecimientos y exportaciones ─────────
CREATE TABLE IF NOT EXISTS usuario_eventos (
  id     BIGINT      NOT NULL AUTO_INCREMENT,
  tipo   VARCHAR(20) NOT NULL,            -- estado | clave | exportacion
  fecha  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  datos  JSON        NOT NULL,
  PRIMARY KEY (id),
  KEY idx_usuario_eventos (tipo, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Empleados ───────────────────────────────────────────────────────
-- (la tabla es de la web: solo se amplía; el correo pasa a ser opcional)
ALTER TABLE empleados
  ADD COLUMN clave      VARCHAR(40) DEFAULT NULL,
  ADD COLUMN sogo_datos JSON        DEFAULT NULL,
  MODIFY COLUMN tipo_documento VARCHAR(60) DEFAULT NULL,
  MODIFY COLUMN email VARCHAR(120) NULL,
  ADD UNIQUE KEY uk_empleados_clave (clave);

UPDATE empleados SET clave = CONCAT('x', id) WHERE clave IS NULL;

ALTER TABLE empleado_deducciones
  ADD COLUMN clave VARCHAR(40) DEFAULT NULL;

-- ── Nóminas ─────────────────────────────────────────────────────────
-- Cada corrida guarda su detalle (novedades, liquidaciones, comprobantes) en `datos`
ALTER TABLE nominas
  ADD COLUMN clave VARCHAR(40) DEFAULT NULL,
  ADD COLUMN datos JSON        DEFAULT NULL,
  ADD UNIQUE KEY uk_nominas_clave (clave);

SET SQL_SAFE_UPDATES = 1;

-- Verificación
SELECT 'usuarios' AS tabla, COUNT(*) AS filas, SUM(clave IS NULL) AS sin_clave FROM usuarios
UNION ALL SELECT 'roles', COUNT(*), SUM(clave IS NULL) FROM roles
UNION ALL SELECT 'empleados', COUNT(*), SUM(clave IS NULL) FROM empleados;


-- ─────────────────────────────── 08_nomina.sql
-- =====================================================================
-- Nómina organizada en la base de datos
--
--  · parametros_nomina: SMMLV, auxilio y recargos por año (antes estaban
--    fijos en la aplicación). Se agregan estado y quién/cuándo los cambió.
--  · configuracion 'nomina_tasas': porcentajes de seguridad social y
--    prestaciones (salud, pensión, caja, ARL, cesantías, prima...).
--  · nominas: totales del período (devengado, deducciones, neto, número
--    de empleados) para consultarlos con SQL sin abrir el JSON.
--  · nomina_novedades, nomina_liquidaciones y comprobantes_pago (ya
--    existían vacías) las llena el servidor de SOGO automáticamente cada
--    vez que se guarda una nómina; al iniciar, completa las que falten.
--
-- Solo se AGREGAN columnas opcionales: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 07.
-- =====================================================================

SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── Parámetros legales por año ──────────────────────────────────────
ALTER TABLE parametros_nomina
  ADD COLUMN estado          VARCHAR(10)  NOT NULL DEFAULT 'Vigente',   -- Cerrado | Vigente | Borrador
  ADD COLUMN actualizado_at  DATETIME     DEFAULT NULL,
  ADD COLUMN actualizado_por VARCHAR(120) DEFAULT NULL;

-- Años anteriores al actual quedan cerrados (lo liquidado con ellos no cambia)
UPDATE parametros_nomina SET estado = 'Cerrado' WHERE anio < YEAR(CURDATE());
UPDATE parametros_nomina SET actualizado_at = NOW(), actualizado_por = 'administrador' WHERE actualizado_at IS NULL;

-- Si faltara algún año (el 02 ya los crea), se agregan los valores de ley
INSERT IGNORE INTO parametros_nomina (anio, smmlv, auxilio_transporte, jornada_semanal, reglas, estado, actualizado_at, actualizado_por) VALUES
  (2025, 1423500, 200000, 44, JSON_OBJECT('extraDay', 0.25, 'extraNight', 0.75, 'nightSurcharge', 0.35), 'Cerrado', NOW(), 'administrador'),
  (2026, 1750905, 249095, 42, JSON_OBJECT('extraDay', 0.25, 'extraNight', 0.75, 'nightSurcharge', 0.35), 'Vigente', NOW(), 'administrador');

-- ── Porcentajes de ley (seguridad social y prestaciones) ────────────
INSERT IGNORE INTO configuracion (clave, valor) VALUES ('nomina_tasas', JSON_OBJECT(
  'employee',  JSON_OBJECT('health', 0.04, 'pension', 0.04, 'solidarity', 0.01),
  'employer',  JSON_OBJECT('pension', 0.12, 'ccf', 0.04),
  'arl',       JSON_OBJECT('I', 0.00522, 'II', 0.01044, 'III', 0.02436, 'IV', 0.0435, 'V', 0.0696),
  'provision', JSON_OBJECT('cesantias', 0.0833, 'intereses', 0.01, 'prima', 0.0833, 'vacaciones', 0.0417)
));

-- ── Totales de cada nómina ──────────────────────────────────────────
ALTER TABLE nominas
  ADD COLUMN num_empleados     INT           DEFAULT NULL,
  ADD COLUMN total_devengado   DECIMAL(14,2) DEFAULT NULL,
  ADD COLUMN total_deducciones DECIMAL(14,2) DEFAULT NULL,
  ADD COLUMN total_neto        DECIMAL(14,2) DEFAULT NULL;

-- ── Comprobación ────────────────────────────────────────────────────
SELECT anio, smmlv, auxilio_transporte, estado FROM parametros_nomina ORDER BY anio;
SELECT clave FROM configuracion WHERE clave = 'nomina_tasas';


-- ─────────────────────────────── 11_nomina_nequi_y_limpieza.sql
CREATE TABLE IF NOT EXISTS nomina_pagos (
  id               BIGINT        NOT NULL AUTO_INCREMENT,
  nomina_id        BIGINT        NOT NULL,
  empleado_id      BIGINT        NOT NULL,
  medio            VARCHAR(20)   NOT NULL DEFAULT 'Nequi',
  cuenta_destino   VARCHAR(30)   NOT NULL,              -- celular Nequi del empleado
  valor            DECIMAL(14,2) NOT NULL,              -- neto transferido
  referencia       VARCHAR(40)   NOT NULL,              -- n.º de la transacción Nequi
  pagado_at        DATETIME      NOT NULL,
  pagado_por       BIGINT        DEFAULT NULL,
  recibido_at      DATETIME      DEFAULT NULL,          -- firma de recibido del empleado
  recibido_nombre  VARCHAR(160)  DEFAULT NULL,
  firma            MEDIUMTEXT    DEFAULT NULL,          -- imagen de la firma (PNG en base64)
  PRIMARY KEY (id),
  UNIQUE KEY uk_nomina_pagos (nomina_id, empleado_id),
  UNIQUE KEY uk_nomina_pagos_ref (medio, referencia),
  CONSTRAINT fk_nomina_pagos_nomina   FOREIGN KEY (nomina_id)   REFERENCES nominas (id) ON DELETE CASCADE,
  CONSTRAINT fk_nomina_pagos_empleado FOREIGN KEY (empleado_id) REFERENCES empleados (id),
  CONSTRAINT fk_nomina_pagos_usuario  FOREIGN KEY (pagado_por)  REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────── 13_inventario.sql
-- =====================================================================
-- Inventarios en la base de datos
--
--  · categorias_inventario.en_uso: Alimentos y Bebidas quedan EN PAUSA
--    (el hospedaje no vende comida ni bebidas por ahora). Sus productos se
--    conservan en el catálogo con todo en 0, sin alertas y sin entradas.
--  · productos_inventario.historial: cambios de cada producto (quién y cuándo).
--  · movimientos_inventario.usuario_nombre: quién registró el movimiento.
--  · Catálogo inicial del hospedaje SIN existencias, costos ni proveedores
--    inventados: las cantidades reales se cargan con el primer conteo físico
--    (Inventarios › Ajustes › Inventario físico) o con las compras.
--  · configuracion 'inventario_alertas': días de aviso, stock bajo, etc.
--
-- Solo AGREGA columnas y filas: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 12.
-- =====================================================================

SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── Columnas nuevas ─────────────────────────────────────────────────
ALTER TABLE categorias_inventario
  ADD COLUMN en_uso TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE productos_inventario
  ADD COLUMN historial JSON DEFAULT NULL;

ALTER TABLE movimientos_inventario
  ADD COLUMN usuario_nombre VARCHAR(160) DEFAULT NULL;

-- ── Categorías: comida y bebidas en pausa ───────────────────────────
INSERT IGNORE INTO categorias_inventario (nombre, prefijo) VALUES
  ('Alimentos', 'ALI'), ('Bebidas', 'BEB'), ('Aseo', 'ASE'), ('Amenities', 'AME'),
  ('Lencería', 'LEN'), ('Papelería', 'PAP'), ('Mantenimiento', 'MAN');
UPDATE categorias_inventario SET en_uso = 0 WHERE nombre IN ('Alimentos', 'Bebidas');
UPDATE categorias_inventario SET en_uso = 1 WHERE nombre NOT IN ('Alimentos', 'Bebidas');

-- ── Catálogo inicial (todo en 0) ────────────────────────────────────
-- Existencias 0, costo 0 y sin proveedor: se completan con datos reales.
-- El nivel mínimo es una sugerencia que se puede cambiar en cada producto.
INSERT IGNORE INTO productos_inventario
  (codigo, nombre, categoria_id, descripcion, unidad, existencias, stock_minimo, ubicacion, costo_unitario, precio_referencia, controla_vencimiento, historial)
SELECT x.codigo, x.nombre, c.id, '', x.unidad, 0, x.minimo, x.ubicacion, 0, NULL, x.vence,
       JSON_ARRAY(JSON_OBJECT('at', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i'), 'by', 'Juan Sebastián Pinilla',
         'text', IF(c.en_uso = 0, 'Producto en catálogo · categoría en pausa (no se usa por ahora)', 'Producto en catálogo · existencias por contar')))
FROM (
  SELECT 'ALI-001' codigo, 'Arroz blanco' nombre, 'Alimentos' cat, 'kg' unidad, 0 minimo, 'Bodega principal' ubicacion, 0 vence
  UNION ALL SELECT 'ALI-002', 'Fríjol cargamanto', 'Alimentos', 'kg', 0, 'Bodega principal', 0
  UNION ALL SELECT 'ALI-003', 'Huevos AA', 'Alimentos', 'cubeta x30', 0, 'Cocina', 1
  UNION ALL SELECT 'ALI-004', 'Café de origen', 'Alimentos', 'kg', 0, 'Bodega principal', 0
  UNION ALL SELECT 'BEB-001', 'Agua en botella 600 ml', 'Bebidas', 'und', 0, 'Bodega principal', 0
  UNION ALL SELECT 'BEB-002', 'Gaseosa 400 ml', 'Bebidas', 'und', 0, 'Bodega principal', 0
  UNION ALL SELECT 'BEB-003', 'Leche entera', 'Bebidas', 'litro', 0, 'Cocina', 1
  UNION ALL SELECT 'ASE-001', 'Detergente líquido', 'Aseo', 'galón', 3, 'Bodega de aseo', 0
  UNION ALL SELECT 'ASE-002', 'Desinfectante', 'Aseo', 'galón', 3, 'Bodega de aseo', 0
  UNION ALL SELECT 'ASE-003', 'Papel higiénico doble hoja', 'Aseo', 'paca x12', 4, 'Bodega de aseo', 0
  UNION ALL SELECT 'ASE-004', 'Toallín de cocina', 'Aseo', 'rollo', 4, 'Bodega de aseo', 0
  UNION ALL SELECT 'ASE-005', 'Jabón lavaplatos', 'Aseo', 'und', 3, 'Bodega de aseo', 0
  UNION ALL SELECT 'ASE-006', 'Bolsas de basura', 'Aseo', 'rollo', 3, 'Bodega de aseo', 0
  UNION ALL SELECT 'AME-001', 'Kit amenities (jabón, champú, acondicionador)', 'Amenities', 'kit', 20, 'Bodega de habitaciones', 0
  UNION ALL SELECT 'AME-002', 'Jabón de tocador 30 g', 'Amenities', 'und', 30, 'Bodega de habitaciones', 0
  UNION ALL SELECT 'LEN-001', 'Toalla de cuerpo blanca', 'Lencería', 'und', 10, 'Bodega de lencería', 0
  UNION ALL SELECT 'LEN-002', 'Juego de sábanas doble', 'Lencería', 'juego', 6, 'Bodega de lencería', 0
  UNION ALL SELECT 'LEN-003', 'Toalla de mano', 'Lencería', 'und', 10, 'Bodega de lencería', 0
  UNION ALL SELECT 'PAP-001', 'Resma papel carta', 'Papelería', 'resma', 1, 'Bodega principal', 0
  UNION ALL SELECT 'MAN-001', 'Bombillo LED 9 W', 'Mantenimiento', 'und', 4, 'Bodega de mantenimiento', 0
) x
JOIN categorias_inventario c ON c.nombre = x.cat;

-- ── Umbrales de alertas (Configuración › Metas e indicadores) ───────
INSERT IGNORE INTO configuracion (clave, valor) VALUES
  ('inventario_alertas', JSON_OBJECT('expiryDays', 7, 'lowStock', TRUE, 'unusualPct', 50, 'maxShrinkPct', 2));

-- ── Comprobación ────────────────────────────────────────────────────
SELECT c.nombre AS categoria, IF(c.en_uso, 'En uso', 'En pausa') AS estado, COUNT(p.id) AS productos,
       COALESCE(SUM(p.existencias), 0) AS existencias
FROM categorias_inventario c LEFT JOIN productos_inventario p ON p.categoria_id = c.id
GROUP BY c.id ORDER BY c.en_uso DESC, c.nombre;


-- ─────────────────────────────── 14_contabilidad.sql
-- =====================================================================
-- Contabilidad en la base de datos
--
--  · asientos / asiento_lineas / asiento_soportes (ya existían vacías, del
--    script 01) pasan a guardar TODOS los comprobantes: los manuales y los
--    que SOGO integra solo desde Reservas, Alojamiento, Nómina e Inventarios.
--    El número (CI-2026-0001...) lo asigna el servidor con `consecutivos`.
--  · asientos: quién creó / anuló (nombre) y cuándo se actualizó.
--  · contabilidad_eventos: historial de integraciones y exportaciones.
--  · configuracion 'contabilidad': fecha de inicio de la contabilidad en
--    SOGO, meses cerrados y cuenta de ingreso de cada categoría de consumo.
--  · Plan de cuentas: se quita el nombre inventado del crédito y se dejan
--    inactivas las cuentas de restaurante (el hospedaje no vende comida).
--
-- NO trae saldos ni movimientos inventados: los saldos iniciales reales se
-- registran en SOGO (Contabilidad › Nuevo movimiento › Saldos iniciales).
-- Solo AGREGA columnas y filas: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 13.
-- =====================================================================

SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── Asientos: nombres de quién creó y anuló ─────────────────────────
ALTER TABLE asientos
  ADD COLUMN usuario_nombre      VARCHAR(160) DEFAULT NULL,
  ADD COLUMN anulado_por_nombre  VARCHAR(160) DEFAULT NULL,
  ADD COLUMN actualizado_at      DATETIME     DEFAULT NULL;

-- ── Historial de integraciones y exportaciones ──────────────────────
CREATE TABLE IF NOT EXISTS contabilidad_eventos (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  tipo            VARCHAR(20)  NOT NULL,              -- Integración | Exportación
  modo            VARCHAR(20)  DEFAULT NULL,          -- Manual | Automática (integraciones)
  creado_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id      BIGINT       DEFAULT NULL,
  usuario_nombre  VARCHAR(160) DEFAULT NULL,
  detalle         JSON         NOT NULL,
  PRIMARY KEY (id),
  KEY idx_cont_eventos_tipo (tipo, creado_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Ajustes contables ───────────────────────────────────────────────
-- inicio: desde esa fecha SOGO integra los módulos (lo anterior entra con
-- los saldos iniciales). Se puede cambiar en Contabilidad › Integración.
INSERT IGNORE INTO configuracion (clave, valor) VALUES ('contabilidad', JSON_OBJECT(
  'inicio', '2026-09-01',
  'cerradoHasta', NULL,
  'mapping', JSON_OBJECT('Alojamiento', '415505', 'Eventos y pasadías', '415510', 'Lavandería', '415520', 'Minibar', '415520',
                         'Daños y faltantes', '425035', 'Otro', '415520')
));

-- ── Plan de cuentas ─────────────────────────────────────────────────
UPDATE cuentas_puc SET nombre = 'Obligaciones financieras' WHERE codigo = '210505';
UPDATE cuentas_puc SET activa = 0 WHERE codigo IN ('415515', '613505');
INSERT IGNORE INTO cuentas_puc (codigo, nombre, clase, corriente, contraria) VALUES
  ('519530', 'Útiles y papelería', 'Gasto', 0, 0),
  ('539520', 'Pérdidas y bajas de inventario', 'Gasto', 0, 0),
  ('425050', 'Recuperaciones y donaciones de inventario', 'Ingreso', 0, 0),
  ('425035', 'Reintegro por daños y faltantes', 'Ingreso', 0, 0);

-- ── Comprobación ────────────────────────────────────────────────────
SELECT clase, COUNT(*) AS cuentas, SUM(activa) AS activas FROM cuentas_puc GROUP BY clase;
SELECT COUNT(*) AS asientos FROM asientos;
SELECT valor FROM configuracion WHERE clave = 'contabilidad';


-- ─────────────────────────────── 15_cuenta_bancos.sql
-- =====================================================================
-- Bancos: la cuenta es 1110 (no la subcuenta 111005)
--
--  · Crea la cuenta 1110 Bancos en el plan de cuentas.
--  · Pasa a 1110 las líneas de comprobantes que ya estaban en 111005
--    (no cambia ningún valor ni número de comprobante).
--  · Quita la cuenta 111005, que queda sin uso.
--
-- Solo toca tablas de Contabilidad: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 14.
-- Se puede volver a ejecutar sin problema.
-- =====================================================================

SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

INSERT IGNORE INTO cuentas_puc (codigo, nombre, clase, corriente, contraria, activa) VALUES
  ('1110', 'Bancos', 'Activo', 1, 0, 1);
UPDATE cuentas_puc SET nombre = 'Bancos', clase = 'Activo', corriente = 1, contraria = 0, activa = 1 WHERE codigo = '1110';

UPDATE asiento_lineas SET cuenta_codigo = '1110' WHERE cuenta_codigo = '111005';
DELETE FROM cuentas_puc WHERE codigo = '111005';

-- ── Comprobación ────────────────────────────────────────────────────
SELECT codigo, nombre, clase, activa FROM cuentas_puc WHERE codigo IN ('1110', '111005');
SELECT cuenta_codigo, COUNT(*) AS lineas FROM asiento_lineas WHERE cuenta_codigo IN ('1110', '111005') GROUP BY cuenta_codigo;


-- ─────────────────────────────── 16_plan_de_cuentas.sql
-- =====================================================================
-- Plan de cuentas del contador (hojas "datos plan de cuentas", 14 págs.)
--
--  · Carga las cuentas de las hojas (clases 1 a 4). Las marcadas "NO" no
--    se cargan. 171024 Mejoras a propiedades ajenas queda INACTIVA.
--  · Subcuentas que en la hoja repetían código (281015, 281505, 414095)
--    quedan como auxiliares de 8 dígitos (28101501, 28150501, 41409501...).
--  · Organiza las cuentas que SOGO tenía con otro código o nombre:
--      415505 Alojamiento ............ → 414005   Hotelería
--      415510 Eventos y pasadías ..... → 41409595 Otros servicios complementarios
--      415520 Servicios adicionales .. → 41409595 Otros servicios complementarios
--      415515 Restaurante y cafetería  → 414015   Restaurantes
--      310505 Capital ................ → 311505   Cuotas o partes de interés social
--      370505 Resultados anteriores .. → 3705     Utilidades acumuladas
--      236530 Ret. honorarios ........ → 236515   Honorarios (236530 = Arrendamientos)
--      425035 Daños y faltantes ...... → 425050   Reintegro de otros costos y gastos
--                                        (425035 = De provisiones)
--    Los movimientos pasan a la cuenta nueva (mismo número y valores).
--  · Nombres según la hoja: 210505 Sobregiros, 237005 EPS, 238030 Fondos de
--    cesantías y/o pensiones, 261005 Cesantías, 280505 De clientes...
--
-- No borra movimientos. Solo toca tablas de Contabilidad: la web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 15.
-- Se puede volver a ejecutar sin problema.
-- =====================================================================

SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── 1. Cuentas de las hojas (crea o corrige nombre, clase y naturaleza) ──
--    (codigo, nombre, clase, corriente, contraria, activa)
INSERT INTO cuentas_puc (codigo, nombre, clase, corriente, contraria, activa) VALUES
  -- Activo
  ('1', 'Activo', 'Activo', 0, 0, 1),
  ('17', 'Diferidos', 'Activo', 0, 0, 1),
  ('1705', 'Gastos pagados por anticipado', 'Activo', 1, 0, 1),
  ('170505', 'Intereses', 'Activo', 1, 0, 1),
  ('170510', 'Honorarios', 'Activo', 1, 0, 1),
  ('170515', 'Comisiones', 'Activo', 1, 0, 1),
  ('170520', 'Seguros y fianzas', 'Activo', 1, 0, 1),
  ('170525', 'Arrendamientos', 'Activo', 1, 0, 1),
  ('170530', 'Bodegajes', 'Activo', 1, 0, 1),
  ('170535', 'Mantenimiento equipos', 'Activo', 1, 0, 1),
  ('170540', 'Servicios', 'Activo', 1, 0, 1),
  ('170545', 'Suscripciones', 'Activo', 1, 0, 1),
  ('170595', 'Otros', 'Activo', 1, 0, 1),
  ('1710', 'Cargos diferidos', 'Activo', 0, 0, 1),
  ('171004', 'Organización y preoperativos', 'Activo', 0, 0, 1),
  ('171008', 'Remodelaciones', 'Activo', 0, 0, 1),
  ('171012', 'Estudios, investigaciones y proyectos', 'Activo', 0, 0, 1),
  ('171016', 'Programas para computador (software)', 'Activo', 0, 0, 1),
  ('171020', 'Útiles y papelería', 'Activo', 0, 0, 1),
  ('171024', 'Mejoras a propiedades ajenas', 'Activo', 0, 0, 0),
  ('171028', 'Contribuciones y afiliaciones', 'Activo', 0, 0, 1),
  ('171032', 'Entrenamiento de personal', 'Activo', 0, 0, 1),
  ('171036', 'Ferias y exposiciones', 'Activo', 0, 0, 1),
  ('171040', 'Licencias', 'Activo', 0, 0, 1),
  ('171044', 'Publicidad, propaganda y promoción', 'Activo', 0, 0, 1),
  ('171048', 'Elementos de aseo y cafetería', 'Activo', 0, 0, 1),
  ('171060', 'Dotación y suministro a trabajadores', 'Activo', 0, 0, 1),
  ('171064', 'Elementos de ropería y lencería', 'Activo', 0, 0, 1),
  ('171068', 'Loza y cristalería', 'Activo', 0, 0, 1),
  ('171069', 'Platería', 'Activo', 0, 0, 1),
  ('171070', 'Cubertería', 'Activo', 0, 0, 1),
  ('171076', 'Impuesto de renta diferido "débitos" por diferencias temporales', 'Activo', 0, 0, 1),
  ('171095', 'Otros', 'Activo', 0, 0, 1),
  ('18', 'Otros activos', 'Activo', 0, 0, 1),
  ('1805', 'Bienes de arte y cultura', 'Activo', 0, 0, 1),
  ('180505', 'Obras de arte', 'Activo', 0, 0, 1),
  ('180510', 'Bibliotecas', 'Activo', 0, 0, 1),
  ('180595', 'Otros', 'Activo', 0, 0, 1),
  ('1899', 'Provisiones', 'Activo', 0, 1, 1),
  ('189905', 'Bienes de arte y cultura', 'Activo', 0, 1, 1),
  ('189995', 'Diversos', 'Activo', 0, 1, 1),
  ('19', 'Valorizaciones', 'Activo', 0, 0, 1),
  ('1905', 'De inversiones', 'Activo', 0, 0, 1),
  ('190510', 'Cuotas o partes de interés social', 'Activo', 0, 0, 1),
  ('1910', 'De propiedades, planta y equipo', 'Activo', 0, 0, 1),
  ('191004', 'Terrenos', 'Activo', 0, 0, 1),
  ('191008', 'Construcciones y edificaciones', 'Activo', 0, 0, 1),
  ('191028', 'Equipo de hoteles y restaurantes', 'Activo', 0, 0, 1),
  -- Pasivo
  ('2', 'Pasivo', 'Pasivo', 0, 0, 1),
  ('21', 'Obligaciones financieras', 'Pasivo', 1, 0, 1),
  ('2105', 'Bancos nacionales', 'Pasivo', 1, 0, 1),
  ('210505', 'Sobregiros', 'Pasivo', 1, 0, 1),
  ('210510', 'Pagarés', 'Pasivo', 1, 0, 1),
  ('210515', 'Cartas de crédito', 'Pasivo', 1, 0, 1),
  ('210520', 'Aceptaciones bancarias', 'Pasivo', 1, 0, 1),
  ('2110', 'Bancos del exterior', 'Pasivo', 1, 0, 1),
  ('211005', 'Sobregiros', 'Pasivo', 1, 0, 1),
  ('211010', 'Pagarés', 'Pasivo', 1, 0, 1),
  ('211015', 'Cartas de crédito', 'Pasivo', 1, 0, 1),
  ('211020', 'Aceptaciones bancarias', 'Pasivo', 1, 0, 1),
  ('2115', 'Corporaciones financieras', 'Pasivo', 1, 0, 1),
  ('211505', 'Pagarés', 'Pasivo', 1, 0, 1),
  ('211510', 'Aceptaciones financieras', 'Pasivo', 1, 0, 1),
  ('211515', 'Cartas de crédito', 'Pasivo', 1, 0, 1),
  ('211520', 'Contratos de arrendamiento financiero (leasing)', 'Pasivo', 1, 0, 1),
  ('2120', 'Compañías de financiamiento comercial', 'Pasivo', 1, 0, 1),
  ('212005', 'Pagarés', 'Pasivo', 1, 0, 1),
  ('212010', 'Aceptaciones financieras', 'Pasivo', 1, 0, 1),
  ('212020', 'Contratos de arrendamiento financiero (leasing)', 'Pasivo', 1, 0, 1),
  ('2125', 'Corporaciones de ahorro y vivienda', 'Pasivo', 1, 0, 1),
  ('212505', 'Sobregiros', 'Pasivo', 1, 0, 1),
  ('212510', 'Pagarés', 'Pasivo', 1, 0, 1),
  ('212515', 'Hipotecarias', 'Pasivo', 1, 0, 1),
  ('2195', 'Otras obligaciones', 'Pasivo', 1, 0, 1),
  ('219505', 'Particulares', 'Pasivo', 1, 0, 1),
  ('219510', 'Compañías vinculadas', 'Pasivo', 1, 0, 1),
  ('219520', 'Socios o accionistas', 'Pasivo', 1, 0, 1),
  ('219525', 'Fondos y cooperativas', 'Pasivo', 1, 0, 1),
  ('219595', 'Otras', 'Pasivo', 1, 0, 1),
  ('22', 'Proveedores', 'Pasivo', 1, 0, 1),
  ('2205', 'Nacionales', 'Pasivo', 1, 0, 1),
  ('2210', 'Del exterior', 'Pasivo', 1, 0, 1),
  ('2215', 'Cuentas corrientes comerciales', 'Pasivo', 1, 0, 1),
  ('2225', 'Compañías vinculadas', 'Pasivo', 1, 0, 1),
  ('23', 'Cuentas por pagar', 'Pasivo', 1, 0, 1),
  ('2305', 'Cuentas corrientes comerciales', 'Pasivo', 1, 0, 1),
  ('2315', 'A compañías vinculadas', 'Pasivo', 1, 0, 1),
  ('2335', 'Costos y gastos por pagar', 'Pasivo', 1, 0, 1),
  ('233505', 'Gastos financieros', 'Pasivo', 1, 0, 1),
  ('233510', 'Gastos legales', 'Pasivo', 1, 0, 1),
  ('233515', 'Libros, suscripciones, periódicos y revistas', 'Pasivo', 1, 0, 1),
  ('233520', 'Comisiones', 'Pasivo', 1, 0, 1),
  ('233525', 'Honorarios', 'Pasivo', 1, 0, 1),
  ('233530', 'Servicios técnicos', 'Pasivo', 1, 0, 1),
  ('233535', 'Servicios de mantenimiento', 'Pasivo', 1, 0, 1),
  ('233540', 'Arrendamientos', 'Pasivo', 1, 0, 1),
  ('233545', 'Transportes, fletes y acarreos', 'Pasivo', 1, 0, 1),
  ('233550', 'Servicios públicos', 'Pasivo', 1, 0, 1),
  ('233555', 'Seguros', 'Pasivo', 1, 0, 1),
  ('233560', 'Gastos de viaje', 'Pasivo', 1, 0, 1),
  ('233565', 'Gastos de representación y relaciones públicas', 'Pasivo', 1, 0, 1),
  ('233570', 'Servicios aduaneros', 'Pasivo', 1, 0, 1),
  ('233595', 'Otros', 'Pasivo', 1, 0, 1),
  ('2355', 'Deudas con socios', 'Pasivo', 1, 0, 1),
  ('235510', 'Socios', 'Pasivo', 1, 0, 1),
  ('2365', 'Retención en la fuente', 'Pasivo', 1, 0, 1),
  ('236505', 'Salarios y pagos laborales', 'Pasivo', 1, 0, 1),
  ('236510', 'Dividendos y/o participaciones', 'Pasivo', 1, 0, 1),
  ('236515', 'Honorarios', 'Pasivo', 1, 0, 1),
  ('236520', 'Comisiones', 'Pasivo', 1, 0, 1),
  ('236525', 'Servicios', 'Pasivo', 1, 0, 1),
  ('236530', 'Arrendamientos', 'Pasivo', 1, 0, 1),
  ('236535', 'Rendimientos financieros', 'Pasivo', 1, 0, 1),
  ('236540', 'Compras', 'Pasivo', 1, 0, 1),
  ('236545', 'Loterías, rifas, apuestas y similares', 'Pasivo', 1, 0, 1),
  ('236550', 'Por pagos al exterior', 'Pasivo', 1, 0, 1),
  ('236560', 'Enajenación propiedades planta y equipo, personas naturales', 'Pasivo', 1, 0, 1),
  ('236565', 'Por impuesto de timbre', 'Pasivo', 1, 0, 1),
  ('236570', 'Otras retenciones y patrimonio', 'Pasivo', 1, 0, 1),
  ('236575', 'Autorretenciones', 'Pasivo', 1, 0, 1),
  ('2367', 'Impuesto a las ventas retenido', 'Pasivo', 1, 0, 1),
  ('2368', 'Impuesto de industria y comercio retenido', 'Pasivo', 1, 0, 1),
  ('2370', 'Retenciones y aportes de nómina', 'Pasivo', 1, 0, 1),
  ('237005', 'Aportes a entidades promotoras de salud, EPS', 'Pasivo', 1, 0, 1),
  ('237006', 'Aportes a administradoras de riesgos profesionales, ARP', 'Pasivo', 1, 0, 1),
  ('237010', 'Aportes al ICBF, SENA y cajas de compensación', 'Pasivo', 1, 0, 1),
  ('237015', 'Aportes al FIC', 'Pasivo', 1, 0, 1),
  ('237025', 'Embargos judiciales', 'Pasivo', 1, 0, 1),
  ('237040', 'Cooperativas', 'Pasivo', 1, 0, 1),
  ('237045', 'Fondos', 'Pasivo', 1, 0, 1),
  ('237095', 'Otros', 'Pasivo', 1, 0, 1),
  ('2375', 'Cuotas por devolver', 'Pasivo', 1, 0, 1),
  ('2380', 'Acreedores varios', 'Pasivo', 1, 0, 1),
  ('238020', 'Reintegros por pagar', 'Pasivo', 1, 0, 1),
  ('238030', 'Fondos de cesantías y/o pensiones', 'Pasivo', 1, 0, 1),
  ('238035', 'Donaciones asignadas por pagar', 'Pasivo', 1, 0, 1),
  ('238095', 'Otros', 'Pasivo', 1, 0, 1),
  ('24', 'Impuestos, gravámenes y tasas', 'Pasivo', 1, 0, 1),
  ('2404', 'De renta y complementarios', 'Pasivo', 1, 0, 1),
  ('240405', 'Vigencia fiscal corriente', 'Pasivo', 1, 0, 1),
  ('240410', 'Vigencias fiscales anteriores', 'Pasivo', 1, 0, 1),
  ('2408', 'Impuesto sobre las ventas por pagar', 'Pasivo', 1, 0, 1),
  ('2412', 'De industria y comercio', 'Pasivo', 1, 0, 1),
  ('241205', 'Vigencia fiscal corriente', 'Pasivo', 1, 0, 1),
  ('241210', 'Vigencias fiscales anteriores', 'Pasivo', 1, 0, 1),
  ('2416', 'A la propiedad raíz', 'Pasivo', 1, 0, 1),
  ('2420', 'Derechos sobre instrumentos públicos', 'Pasivo', 1, 0, 1),
  ('2424', 'De valorización', 'Pasivo', 1, 0, 1),
  ('242405', 'Vigencia fiscal corriente', 'Pasivo', 1, 0, 1),
  ('242410', 'Vigencias fiscales anteriores', 'Pasivo', 1, 0, 1),
  ('2428', 'De turismo', 'Pasivo', 1, 0, 1),
  ('2436', 'De vehículos', 'Pasivo', 1, 0, 1),
  ('243605', 'Vigencia fiscal corriente', 'Pasivo', 1, 0, 1),
  ('243610', 'Vigencias fiscales anteriores', 'Pasivo', 1, 0, 1),
  ('25', 'Obligaciones laborales', 'Pasivo', 1, 0, 1),
  ('2505', 'Salarios por pagar', 'Pasivo', 1, 0, 1),
  ('2510', 'Cesantías consolidadas', 'Pasivo', 1, 0, 1),
  ('251010', 'Ley 50 de 1990 y normas posteriores', 'Pasivo', 1, 0, 1),
  ('2515', 'Intereses sobre cesantías', 'Pasivo', 1, 0, 1),
  ('2520', 'Prima de servicios', 'Pasivo', 1, 0, 1),
  ('2525', 'Vacaciones consolidadas', 'Pasivo', 1, 0, 1),
  ('2530', 'Prestaciones extralegales', 'Pasivo', 1, 0, 1),
  ('253005', 'Primas', 'Pasivo', 1, 0, 1),
  ('253010', 'Auxilios', 'Pasivo', 1, 0, 1),
  ('253015', 'Dotación y suministro a trabajadores', 'Pasivo', 1, 0, 1),
  ('253020', 'Bonificaciones', 'Pasivo', 1, 0, 1),
  ('253025', 'Seguros', 'Pasivo', 1, 0, 1),
  ('253095', 'Otras', 'Pasivo', 1, 0, 1),
  ('2532', 'Pensiones por pagar', 'Pasivo', 1, 0, 1),
  ('2535', 'Cuotas partes pensiones de jubilación', 'Pasivo', 1, 0, 1),
  ('2540', 'Indemnizaciones laborales', 'Pasivo', 1, 0, 1),
  ('26', 'Pasivos estimados y provisiones', 'Pasivo', 1, 0, 1),
  ('2605', 'Para costos y gastos', 'Pasivo', 1, 0, 1),
  ('260505', 'Intereses', 'Pasivo', 1, 0, 1),
  ('260510', 'Comisiones', 'Pasivo', 1, 0, 1),
  ('260515', 'Honorarios', 'Pasivo', 1, 0, 1),
  ('260520', 'Servicios técnicos', 'Pasivo', 1, 0, 1),
  ('260525', 'Transportes, fletes y acarreos', 'Pasivo', 1, 0, 1),
  ('260530', 'Gastos de viaje', 'Pasivo', 1, 0, 1),
  ('260535', 'Servicios públicos', 'Pasivo', 1, 0, 1),
  ('260545', 'Garantías', 'Pasivo', 1, 0, 1),
  ('260550', 'Materiales y repuestos', 'Pasivo', 1, 0, 1),
  ('260595', 'Otros', 'Pasivo', 1, 0, 1),
  ('2610', 'Para obligaciones laborales', 'Pasivo', 1, 0, 1),
  ('261005', 'Cesantías', 'Pasivo', 1, 0, 1),
  ('261010', 'Intereses sobre cesantías', 'Pasivo', 1, 0, 1),
  ('261015', 'Vacaciones', 'Pasivo', 1, 0, 1),
  ('261020', 'Prima de servicios', 'Pasivo', 1, 0, 1),
  ('261025', 'Prestaciones extralegales', 'Pasivo', 1, 0, 1),
  ('261030', 'Viáticos', 'Pasivo', 1, 0, 1),
  ('261095', 'Otras', 'Pasivo', 1, 0, 1),
  ('2615', 'Para obligaciones fiscales', 'Pasivo', 1, 0, 1),
  ('261505', 'De renta y complementarios', 'Pasivo', 1, 0, 1),
  ('261510', 'De industria y comercio', 'Pasivo', 1, 0, 1),
  ('261520', 'De vehículos', 'Pasivo', 1, 0, 1),
  ('261595', 'Otros', 'Pasivo', 1, 0, 1),
  ('2620', 'Pensiones de jubilación', 'Pasivo', 0, 0, 1),
  ('262005', 'Cálculo actuarial pensiones de jubilación', 'Pasivo', 0, 0, 1),
  ('262010', 'Pensiones de jubilación por amortizar (DB)', 'Pasivo', 0, 1, 1),
  ('2630', 'Para mantenimiento y reparaciones', 'Pasivo', 1, 0, 1),
  ('263010', 'Construcciones y edificaciones', 'Pasivo', 1, 0, 1),
  ('263015', 'Maquinaria y equipo', 'Pasivo', 1, 0, 1),
  ('263020', 'Equipo de oficina', 'Pasivo', 1, 0, 1),
  ('263025', 'Equipo de computación y comunicación', 'Pasivo', 1, 0, 1),
  ('263035', 'Equipo de hoteles y restaurantes', 'Pasivo', 1, 0, 1),
  ('263040', 'Flota y equipo de transporte', 'Pasivo', 1, 0, 1),
  ('2635', 'Para contingencias', 'Pasivo', 1, 0, 1),
  ('263505', 'Multas y sanciones autoridades administrativas', 'Pasivo', 1, 0, 1),
  ('263510', 'Intereses por multas y sanciones', 'Pasivo', 1, 0, 1),
  ('263515', 'Reclamos', 'Pasivo', 1, 0, 1),
  ('263520', 'Laborales', 'Pasivo', 1, 0, 1),
  ('263525', 'Civiles', 'Pasivo', 1, 0, 1),
  ('263530', 'Penales', 'Pasivo', 1, 0, 1),
  ('263535', 'Administrativos', 'Pasivo', 1, 0, 1),
  ('263540', 'Comerciales', 'Pasivo', 1, 0, 1),
  ('263595', 'Otras', 'Pasivo', 1, 0, 1),
  ('2640', 'Para obligaciones de garantías', 'Pasivo', 1, 0, 1),
  ('2695', 'Provisiones diversas', 'Pasivo', 1, 0, 1),
  ('269510', 'Para comunicaciones', 'Pasivo', 1, 0, 1),
  ('269515', 'Para pérdida en transporte', 'Pasivo', 1, 0, 1),
  ('269520', 'Para operación', 'Pasivo', 1, 0, 1),
  ('269535', 'Autoseguro', 'Pasivo', 1, 0, 1),
  ('269595', 'Otras', 'Pasivo', 1, 0, 1),
  ('27', 'Diferidos', 'Pasivo', 1, 0, 1),
  ('2705', 'Ingresos recibidos por anticipado', 'Pasivo', 1, 0, 1),
  ('270505', 'Intereses', 'Pasivo', 1, 0, 1),
  ('270510', 'Comisiones', 'Pasivo', 1, 0, 1),
  ('270515', 'Arrendamientos', 'Pasivo', 1, 0, 1),
  ('270520', 'Honorarios', 'Pasivo', 1, 0, 1),
  ('270525', 'Servicios técnicos', 'Pasivo', 1, 0, 1),
  ('270530', 'De suscriptores', 'Pasivo', 1, 0, 1),
  ('270595', 'Otros', 'Pasivo', 1, 0, 1),
  ('2725', 'Impuestos diferidos', 'Pasivo', 0, 0, 1),
  ('272505', 'Por depreciación flexible', 'Pasivo', 0, 0, 1),
  ('272595', 'Diversos', 'Pasivo', 0, 0, 1),
  ('272599', 'Ajustes por inflación', 'Pasivo', 0, 0, 1),
  ('28', 'Otros pasivos', 'Pasivo', 1, 0, 1),
  ('2805', 'Anticipos y avances recibidos', 'Pasivo', 1, 0, 1),
  ('280505', 'De clientes', 'Pasivo', 1, 0, 1),
  ('280510', 'Sobre contratos', 'Pasivo', 1, 0, 1),
  ('280595', 'Otros', 'Pasivo', 1, 0, 1),
  ('2810', 'Depósitos recibidos', 'Pasivo', 1, 0, 1),
  ('281010', 'Para futuro pago de cuotas o derechos sociales', 'Pasivo', 1, 0, 1),
  ('281015', 'Para garantía en la prestación de servicios', 'Pasivo', 1, 0, 1),
  ('28101501', 'Depósitos de reservas de habitaciones', 'Pasivo', 1, 0, 1),
  ('28101502', 'Depósitos para garantías de fiestas y eventos', 'Pasivo', 1, 0, 1),
  ('281020', 'Para garantía de contratos', 'Pasivo', 1, 0, 1),
  ('281025', 'De licitaciones', 'Pasivo', 1, 0, 1),
  ('281095', 'Otros', 'Pasivo', 1, 0, 1),
  ('2815', 'Ingresos recibidos para terceros', 'Pasivo', 1, 0, 1),
  ('281505', 'Valores recibidos para terceros', 'Pasivo', 1, 0, 1),
  ('28150501', 'Propinas a favor de empleados', 'Pasivo', 1, 0, 1),
  ('28150502', 'Recaudos a favor de cías. de seguro', 'Pasivo', 1, 0, 1),
  ('28150503', 'Otros ingresos a favor de terceros', 'Pasivo', 1, 0, 1),
  ('281510', 'Venta por cuenta de terceros', 'Pasivo', 1, 0, 1),
  ('2825', 'Retenciones a terceros sobre contratos', 'Pasivo', 1, 0, 1),
  ('282505', 'Cumplimiento obligaciones laborales', 'Pasivo', 1, 0, 1),
  ('282515', 'Garantía cumplimiento de contratos', 'Pasivo', 1, 0, 1),
  ('2830', 'Embargos judiciales', 'Pasivo', 1, 0, 1),
  ('283005', 'Indemnizaciones', 'Pasivo', 1, 0, 1),
  ('283010', 'Depósitos judiciales', 'Pasivo', 1, 0, 1),
  -- Patrimonio
  ('3', 'Patrimonio', 'Patrimonio', 0, 0, 1),
  ('31', 'Capital social', 'Patrimonio', 0, 0, 1),
  ('3115', 'Aportes sociales', 'Patrimonio', 0, 0, 1),
  ('311505', 'Cuotas o partes de interés social', 'Patrimonio', 0, 0, 1),
  ('311510', 'Aportes de socios-fondo mutuo de inversión', 'Patrimonio', 0, 0, 1),
  ('311515', 'Contribución de la empresa-fondo mutuo de inversión', 'Patrimonio', 0, 0, 1),
  ('311520', 'Suscripciones del público', 'Patrimonio', 0, 0, 1),
  ('32', 'Superávit de capital', 'Patrimonio', 0, 0, 1),
  ('3205', 'Prima en colocación de cuotas o partes de interés social', 'Patrimonio', 0, 0, 1),
  ('320515', 'Prima en colocación de cuotas o partes de interés social', 'Patrimonio', 0, 0, 1),
  ('33', 'Reservas', 'Patrimonio', 0, 0, 1),
  ('3305', 'Reservas obligatorias', 'Patrimonio', 0, 0, 1),
  ('330505', 'Reserva legal', 'Patrimonio', 0, 0, 1),
  ('330510', 'Reservas por disposiciones fiscales', 'Patrimonio', 0, 0, 1),
  ('330517', 'Reserva para readquisición de cuotas o partes de interés social', 'Patrimonio', 0, 0, 1),
  ('330518', 'Cuotas o partes de interés social propias readquiridas (DB)', 'Patrimonio', 0, 1, 1),
  ('3310', 'Reservas estatutarias', 'Patrimonio', 0, 0, 1),
  ('331005', 'Para futuras capitalizaciones', 'Patrimonio', 0, 0, 1),
  ('331010', 'Para reposición de activos', 'Patrimonio', 0, 0, 1),
  ('331015', 'Para futuros ensanches', 'Patrimonio', 0, 0, 1),
  ('331095', 'Otras', 'Patrimonio', 0, 0, 1),
  ('3315', 'Reservas ocasionales', 'Patrimonio', 0, 0, 1),
  ('331505', 'Para beneficencia y civismo', 'Patrimonio', 0, 0, 1),
  ('331510', 'Para futuras capitalizaciones', 'Patrimonio', 0, 0, 1),
  ('331515', 'Para futuros ensanches', 'Patrimonio', 0, 0, 1),
  ('331520', 'Para adquisición o reposición de propiedades, planta y equipo', 'Patrimonio', 0, 0, 1),
  ('331525', 'Para investigaciones y desarrollo', 'Patrimonio', 0, 0, 1),
  ('331530', 'Para fomento económico', 'Patrimonio', 0, 0, 1),
  ('331535', 'Para capital de trabajo', 'Patrimonio', 0, 0, 1),
  ('331595', 'Otras', 'Patrimonio', 0, 0, 1),
  ('36', 'Resultados del ejercicio', 'Patrimonio', 0, 0, 1),
  ('3605', 'Utilidad del ejercicio', 'Patrimonio', 0, 0, 1),
  ('3610', 'Pérdida del ejercicio', 'Patrimonio', 0, 1, 1),
  ('37', 'Resultados de ejercicios anteriores', 'Patrimonio', 0, 0, 1),
  ('3705', 'Utilidades acumuladas', 'Patrimonio', 0, 0, 1),
  ('3710', 'Pérdidas acumuladas', 'Patrimonio', 0, 1, 1),
  ('38', 'Superávit por valorizaciones', 'Patrimonio', 0, 0, 1),
  ('3805', 'De inversiones', 'Patrimonio', 0, 0, 1),
  ('380510', 'Cuotas o partes de interés social', 'Patrimonio', 0, 0, 1),
  ('3810', 'De propiedades, planta y equipo', 'Patrimonio', 0, 0, 1),
  ('381004', 'Terrenos', 'Patrimonio', 0, 0, 1),
  ('381008', 'Construcciones y edificaciones', 'Patrimonio', 0, 0, 1),
  ('381012', 'Maquinaria y equipo', 'Patrimonio', 0, 0, 1),
  ('381016', 'Equipo de oficina', 'Patrimonio', 0, 0, 1),
  ('381020', 'Equipo de computación y comunicación', 'Patrimonio', 0, 0, 1),
  ('381028', 'Equipo de hoteles y restaurantes', 'Patrimonio', 0, 0, 1),
  ('381032', 'Flota y equipo de transporte', 'Patrimonio', 0, 0, 1),
  ('3895', 'De otros activos', 'Patrimonio', 0, 0, 1),
  -- Ingresos
  ('4', 'Ingresos', 'Ingreso', 0, 0, 1),
  ('41', 'Operacionales', 'Ingreso', 0, 0, 1),
  ('4140', 'Hoteles y restaurantes', 'Ingreso', 0, 0, 1),
  ('414005', 'Hotelería', 'Ingreso', 0, 0, 1),
  ('414015', 'Restaurantes', 'Ingreso', 0, 0, 1),
  ('414095', 'Actividades conexas', 'Ingreso', 0, 0, 1),
  ('41409501', 'Servicio de lavandería', 'Ingreso', 0, 0, 1),
  ('41409502', 'Servicio de teléfono', 'Ingreso', 0, 0, 1),
  ('41409503', 'Servicio de internet', 'Ingreso', 0, 0, 1),
  ('41409504', 'Alquiler de salones', 'Ingreso', 0, 0, 1),
  ('41409505', 'Venta de cigarrillos', 'Ingreso', 0, 0, 1),
  ('41409506', 'Venta en tiendas y droguerías', 'Ingreso', 0, 0, 1),
  ('41409595', 'Otros servicios complementarios a la hotelería', 'Ingreso', 0, 0, 1),
  ('4175', 'Devoluciones en ventas (DB)', 'Ingreso', 0, 1, 1),
  ('42', 'No operacionales', 'Ingreso', 0, 0, 1),
  ('4210', 'Financieros', 'Ingreso', 0, 0, 1),
  ('421005', 'Intereses', 'Ingreso', 0, 0, 1),
  ('421015', 'Descuentos amortizados', 'Ingreso', 0, 0, 1),
  ('421020', 'Diferencia en cambio', 'Ingreso', 0, 0, 1),
  ('421040', 'Descuentos comerciales condicionados', 'Ingreso', 0, 0, 1),
  ('421045', 'Descuentos bancarios', 'Ingreso', 0, 0, 1),
  ('421055', 'Multas y recargos', 'Ingreso', 0, 0, 1),
  ('421060', 'Sanciones cheques devueltos', 'Ingreso', 0, 0, 1),
  ('421095', 'Otros', 'Ingreso', 0, 0, 1),
  ('4215', 'Dividendos y participaciones', 'Ingreso', 0, 0, 1),
  ('4220', 'Arrendamientos', 'Ingreso', 0, 0, 1),
  ('422020', 'Equipo de oficina', 'Ingreso', 0, 0, 1),
  ('422025', 'Equipo de computación y comunicación', 'Ingreso', 0, 0, 1),
  ('422035', 'Equipo de hoteles y restaurantes', 'Ingreso', 0, 0, 1),
  ('422040', 'Flota y equipo de transporte', 'Ingreso', 0, 0, 1),
  ('4230', 'Honorarios', 'Ingreso', 0, 0, 1),
  ('423005', 'Asesorías', 'Ingreso', 0, 0, 1),
  ('423010', 'Asistencia técnica', 'Ingreso', 0, 0, 1),
  ('4240', 'Utilidad en venta de inversiones', 'Ingreso', 0, 0, 1),
  ('424010', 'Cuotas o partes de interés social', 'Ingreso', 0, 0, 1),
  ('424015', 'Bonos', 'Ingreso', 0, 0, 1),
  ('4245', 'Utilidad en venta de propiedades, planta y equipo', 'Ingreso', 0, 0, 1),
  ('424524', 'Equipo de oficina', 'Ingreso', 0, 0, 1),
  ('424528', 'Equipo de computación y comunicación', 'Ingreso', 0, 0, 1),
  ('424536', 'Equipo de hoteles y restaurantes', 'Ingreso', 0, 0, 1),
  ('424540', 'Flota y equipo de transporte', 'Ingreso', 0, 0, 1),
  ('4248', 'Utilidad en venta de otros bienes', 'Ingreso', 0, 0, 1),
  ('424805', 'Intangibles', 'Ingreso', 0, 0, 1),
  ('424810', 'Otros activos', 'Ingreso', 0, 0, 1),
  ('4250', 'Recuperaciones', 'Ingreso', 0, 0, 1),
  ('425005', 'Deudas malas', 'Ingreso', 0, 0, 1),
  ('425010', 'Seguros', 'Ingreso', 0, 0, 1),
  ('425015', 'Reclamos', 'Ingreso', 0, 0, 1),
  ('425030', 'Descuentos concedidos', 'Ingreso', 0, 0, 1),
  ('425035', 'De provisiones', 'Ingreso', 0, 0, 1),
  ('425050', 'Reintegro de otros costos y gastos', 'Ingreso', 0, 0, 1)
AS n ON DUPLICATE KEY UPDATE nombre = n.nombre, clase = n.clase, corriente = n.corriente, contraria = n.contraria, activa = n.activa;

-- ── 2. Cuentas de SOGO con otro código: sus movimientos pasan a la cuenta de la hoja ──
UPDATE asiento_lineas SET cuenta_codigo = '414005'   WHERE cuenta_codigo = '415505';
UPDATE asiento_lineas SET cuenta_codigo = '41409595' WHERE cuenta_codigo IN ('415510', '415520');
UPDATE asiento_lineas SET cuenta_codigo = '414015'   WHERE cuenta_codigo = '415515';
UPDATE asiento_lineas SET cuenta_codigo = '311505'   WHERE cuenta_codigo = '310505';
UPDATE asiento_lineas SET cuenta_codigo = '3705'     WHERE cuenta_codigo = '370505';
UPDATE asiento_lineas SET cuenta_codigo = '236515'   WHERE cuenta_codigo = '236530';   -- era la retención por honorarios
UPDATE asiento_lineas SET cuenta_codigo = '425050'   WHERE cuenta_codigo = '425035';   -- eran los daños y faltantes
DELETE FROM cuentas_puc WHERE codigo IN ('415505', '415510', '415520', '415515', '310505', '370505');

-- ── 3. Cuenta de ingreso de cada categoría (Contabilidad › Integración) ──
UPDATE configuracion SET valor = JSON_SET(valor,
  '$.mapping.Alojamiento', '414005', '$.mapping."Eventos y pasadías"', '41409595', '$.mapping."Lavandería"', '41409501',
  '$.mapping.Minibar', '41409595', '$.mapping."Daños y faltantes"', '425050', '$.mapping.Otro', '41409595')
WHERE clave = 'contabilidad';

-- ── Comprobación ────────────────────────────────────────────────────
SELECT clase, COUNT(*) AS cuentas, SUM(activa) AS activas FROM cuentas_puc GROUP BY clase ORDER BY MIN(codigo);
SELECT codigo, nombre FROM cuentas_puc WHERE codigo IN ('210505', '236515', '236530', '237005', '238030', '261005', '280505', '28101501', '414005', '425035', '425050');
SELECT valor FROM configuracion WHERE clave = 'contabilidad';


-- ─────────────────────────────── 17_mensajes.sql
-- =====================================================================
-- Mensajes de la página web (Contacto) en SOGO
--
--  · contactos (la llena la web): se AGREGAN columnas opcionales para saber
--    quién respondió desde SOGO, por qué canal y cuándo se leyó. La web
--    sigue igual: crea mensajes en estado 'nuevo' y SOGO los pasa a
--    'leido', 'respondido' o 'archivado'.
--  · contacto_respuestas: historial de cada respuesta (texto, canal, quién).
--  · respuestas_rapidas: plantillas para las preguntas frecuentes. Se
--    editan en SOGO (Mensajes › Respuestas rápidas). Lo que está entre
--    [corchetes] se completa antes de enviar.
--  · Permisos: nuevo módulo "Mensajes"; cada rol recibe los mismos permisos
--    que tiene en Reservas (se cambian en Usuarios › Roles).
--
-- Solo AGREGA columnas, tablas y filas: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 16.
-- =====================================================================

SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

-- ── Columnas nuevas en contactos (todas opcionales) ──────────────────
ALTER TABLE contactos
  ADD COLUMN respondido_por_usuario  BIGINT       DEFAULT NULL,
  ADD COLUMN respondido_por_nombre   VARCHAR(160) DEFAULT NULL,
  ADD COLUMN canal_respuesta         VARCHAR(20)  DEFAULT NULL,   -- Correo | WhatsApp | Llamada
  ADD COLUMN leido_at                DATETIME     DEFAULT NULL,
  ADD COLUMN leido_por_nombre        VARCHAR(160) DEFAULT NULL;

-- ── Historial de respuestas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacto_respuestas (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  contacto_id     BIGINT       NOT NULL,
  canal           VARCHAR(20)  NOT NULL,              -- Correo | WhatsApp | Llamada
  texto           TEXT         NOT NULL,
  plantilla_id    BIGINT       DEFAULT NULL,
  usuario_id      BIGINT       DEFAULT NULL,
  usuario_nombre  VARCHAR(160) DEFAULT NULL,
  creado_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contacto_respuestas_contacto (contacto_id),
  CONSTRAINT fk_contacto_respuestas_contacto FOREIGN KEY (contacto_id) REFERENCES contactos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Respuestas rápidas ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS respuestas_rapidas (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  titulo          VARCHAR(120) NOT NULL,
  categoria       VARCHAR(30)  NOT NULL DEFAULT 'otro',   -- reserva | servicio | precio | evento | queja | sugerencia | otro
  texto           TEXT         NOT NULL,
  activa          TINYINT(1)   NOT NULL DEFAULT 1,
  usos            INT          NOT NULL DEFAULT 0,
  actualizado_at  DATETIME     DEFAULT NULL,
  actualizado_por VARCHAR(160) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_respuestas_rapidas_titulo (titulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- {nombre} y {asunto} se reemplazan solos; lo que va entre [corchetes] lo completa quien responde.
INSERT IGNORE INTO respuestas_rapidas (titulo, categoria, texto, actualizado_at, actualizado_por) VALUES
('Saludo y agradecimiento', 'otro',
 'Hola {nombre}, gracias por escribirnos a Hospedaje Sebastián. [Respuesta]\n\nQuedamos atentos a cualquier otra inquietud.\nHospedaje Sebastián · Filandia, Quindío\n+57 311 340 8867 · +57 314 755 6717 (WhatsApp)', NOW(), 'SOGO'),
('Disponibilidad para una reserva', 'reserva',
 'Hola {nombre}, gracias por tu interés en hospedarte con nosotros. Para las fechas [fecha de llegada] a [fecha de salida] tenemos disponible [habitación / piso] para [número] personas, por un valor de $[valor] la noche.\n\nPara confirmar la reserva te pedimos un anticipo de $[valor anticipo]. ¿Deseas que la separemos?\n\nHospedaje Sebastián · +57 311 340 8867 (WhatsApp)', NOW(), 'SOGO'),
('Sin disponibilidad en las fechas', 'reserva',
 'Hola {nombre}, gracias por escribirnos. Lamentablemente para las fechas [fechas] no tenemos disponibilidad. Te podemos ofrecer [fechas alternativas]. ¿Te sirven?\n\nHospedaje Sebastián · +57 311 340 8867 (WhatsApp)', NOW(), 'SOGO'),
('Horarios de check-in y check-out', 'reserva',
 'Hola {nombre}, el check-in es a partir de las 2:00 p. m. y el check-out hasta las 12:00 m. Si necesitas llegar antes o salir más tarde, cuéntanos y lo revisamos según la disponibilidad.\n\nHospedaje Sebastián', NOW(), 'SOGO'),
('Ubicación y cómo llegar', 'servicio',
 'Hola {nombre}, estamos en la Carrera 3ra #5-65, Filandia, Quindío (centro del pueblo). Si necesitas indicaciones o la ubicación por WhatsApp, escríbenos al +57 311 340 8867.\n\nHospedaje Sebastián', NOW(), 'SOGO'),
('Tarifas', 'precio',
 'Hola {nombre}, gracias por tu consulta. La tarifa para [tipo de habitación / piso] es de $[valor] por noche para [número] personas. [Condiciones: incluye / no incluye]\n\nCon gusto te ayudamos a reservar.\nHospedaje Sebastián · +57 311 340 8867 (WhatsApp)', NOW(), 'SOGO'),
('Servicios del hospedaje', 'servicio',
 'Hola {nombre}, en Hospedaje Sebastián contamos con [servicios: wifi, cocina de uso compartido, parqueadero...]. No vendemos alimentos, pero la cocina está disponible para los huéspedes.\n\n¿Hay algo más en lo que te podamos ayudar?', NOW(), 'SOGO'),
('Cotización de evento', 'evento',
 'Hola {nombre}, gracias por pensar en nosotros para tu evento. Para cotizarte necesitamos: fecha, número de personas, horario y qué espacios necesitas. Con esa información te enviamos la propuesta.\n\nHospedaje Sebastián · +57 311 340 8867 (WhatsApp)', NOW(), 'SOGO'),
('Respuesta a una queja', 'queja',
 'Hola {nombre}, lamentamos mucho lo ocurrido y gracias por contárnoslo. [Qué se hizo para solucionarlo]\n\nTu opinión nos ayuda a mejorar. Si quieres, podemos llamarte para conversarlo.\nHospedaje Sebastián', NOW(), 'SOGO'),
('Agradecimiento por la sugerencia', 'sugerencia',
 'Hola {nombre}, muchas gracias por tu sugerencia. La compartimos con el equipo para tenerla en cuenta.\n\nHospedaje Sebastián', NOW(), 'SOGO');

-- ── Permisos del módulo Mensajes (igual que Reservas en cada rol) ────
INSERT IGNORE INTO rol_permisos (rol_id, modulo, ver, crear, editar, eliminar, exportar, alcance)
SELECT rol_id, 'Mensajes', ver, crear, editar, eliminar, exportar, NULL FROM rol_permisos WHERE modulo = 'Reservas';

-- ── Comprobación ────────────────────────────────────────────────────
SELECT estado, COUNT(*) AS mensajes FROM contactos GROUP BY estado;
SELECT COUNT(*) AS respuestas_rapidas FROM respuestas_rapidas;
SELECT r.nombre AS rol, p.ver, p.editar FROM rol_permisos p JOIN roles r ON r.id = p.rol_id WHERE p.modulo = 'Mensajes';


-- ─────────────────────────────── 18_plan_de_cuentas_gastos_costos.sql
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


-- ─────────────────────────────── 19_tarifas.sql
-- =====================================================================
-- Tarifas editables desde SOGO y usadas por la página web.
--
--  1. Tabla `tarifas_reserva`: precio POR PERSONA de cada tipo de reserva
--     (individual, familiar, pasadía, grupo de trabajo) en cada temporada.
--     Hospedaje: por persona y noche. Pasadía / grupo: por persona y día.
--     Reglas de niños (las aplica la web y su backend): de 4 a 10 años pagan
--     el 60 %, de 0 a 3 años no pagan, desde los 11 años tarifa completa.
--
--  2. Columnas `precio_media` y `precio_alta` en `habitaciones`. La columna
--     existente `precio_noche` es la tarifa de temporada BAJA (se conserva el
--     nombre para no romper lo que ya la usa). Son el precio por noche de la
--     habitación que muestra la página web.
--
-- Temporadas (las calcula el sistema por fecha de llegada):
--   Alta : 15 dic – 15 ene, 15 jun – 15 jul y Semana Santa.
--   Media: fines de semana y festivos.
--   Baja : el resto del año.
--
-- Los valores iniciales son un punto de partida: revísalos en
-- SOGO › Alojamiento › Tarifas y temporadas. Se puede ejecutar más de una vez.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tarifas_reserva (
  id                 BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tipo_reserva       VARCHAR(20)  NOT NULL,
  nombre             VARCHAR(60)  NOT NULL,
  precio_baja        DOUBLE       NOT NULL,
  precio_media       DOUBLE       NOT NULL,
  precio_alta        DOUBLE       NOT NULL,
  fecha_modificacion DATETIME     NULL,
  CONSTRAINT uk_tarifas_reserva_tipo UNIQUE (tipo_reserva)
);

INSERT IGNORE INTO tarifas_reserva (tipo_reserva, nombre, precio_baja, precio_media, precio_alta, fecha_modificacion) VALUES
  ('individual', 'Hospedaje individual', 35000, 45000, 60000, NOW()),
  ('familiar',   'Familia o grupo',      35000, 45000, 60000, NOW()),
  ('pasadia',    'Pasadía',              35000, 45000, 60000, NOW()),
  ('grupal',     'Grupo de trabajo',     60000, 75000, 90000, NOW());

-- Corrige el nombre si se guardó con la codificación equivocada («PasadÃ­a»)
SET SQL_SAFE_UPDATES = 0;
UPDATE tarifas_reserva SET nombre = _utf8mb4'Pasadía' WHERE tipo_reserva = 'pasadia' AND nombre <> _utf8mb4'Pasadía';
SET SQL_SAFE_UPDATES = 1;

-- Columnas de temporada en habitaciones (solo si no existen)
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'habitaciones' AND COLUMN_NAME = 'precio_media') = 0,
  'ALTER TABLE habitaciones ADD COLUMN precio_media DOUBLE NULL AFTER precio_noche',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'habitaciones' AND COLUMN_NAME = 'precio_alta') = 0,
  'ALTER TABLE habitaciones ADD COLUMN precio_alta DOUBLE NULL AFTER precio_media',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Valores iniciales de media y alta a partir de la tarifa baja (redondeados a $5.000)
SET SQL_SAFE_UPDATES = 0;
UPDATE habitaciones SET precio_media = ROUND(precio_noche * 1.27 / 5000) * 5000 WHERE precio_media IS NULL AND precio_noche IS NOT NULL;
UPDATE habitaciones SET precio_alta  = ROUND(precio_noche * 1.73 / 5000) * 5000 WHERE precio_alta  IS NULL AND precio_noche IS NOT NULL;
SET SQL_SAFE_UPDATES = 1;

-- Verificación
SELECT tipo_reserva, nombre, precio_baja, precio_media, precio_alta FROM tarifas_reserva ORDER BY id;
SELECT numero, precio_noche AS baja, precio_media AS media, precio_alta AS alta FROM habitaciones ORDER BY numero;


-- ─────────────────────────────── 20_temporadas.sql
-- =====================================================================
-- Calendario de temporadas en la base de datos (configuracion 'temporadas')
--
-- Lo gestiona SOGO en Alojamiento › Tarifas y temporadas y lo leen la página
-- web (reservador y servidor) y Reservas de SOGO. Antes estaba fijo en el
-- código de la web. Reglas iniciales (las mismas de antes):
--   · Alta: 15 dic – 15 ene, 15 jun – 15 jul y Semana Santa.
--   · Media: fines de semana y festivos.
--   · Baja: el resto.
-- Cambio: los festivos ahora son los de Colombia completos de 2026 y 2027
-- (antes solo 6 fechas fijas; faltaban los lunes festivos). Se agregan más
-- años desde SOGO con el botón «+ Festivos de Colombia».
--
-- Solo agrega una fila en configuracion: la web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 19.
-- Si ya existe (se guardó desde SOGO), no la cambia.
-- =====================================================================

SET NAMES utf8mb4;

INSERT IGNORE INTO configuracion (clave, valor) VALUES ('temporadas', JSON_OBJECT(
  'alta', JSON_ARRAY(
    JSON_OBJECT('nombre', 'Fin y comienzo de año', 'desde', '12-15', 'hasta', '01-15'),
    JSON_OBJECT('nombre', 'Vacaciones de mitad de año', 'desde', '06-15', 'hasta', '07-15')),
  'media', JSON_ARRAY(),
  'semanaSanta', TRUE,
  'finesDeSemana', TRUE,
  'festivosMedia', TRUE,
  'festivos', JSON_ARRAY(
    '2026-01-01','2026-01-12','2026-03-23','2026-04-02','2026-04-03','2026-05-01','2026-05-18','2026-06-08','2026-06-15',
    '2026-06-29','2026-07-20','2026-08-07','2026-08-17','2026-10-12','2026-11-02','2026-11-16','2026-12-08','2026-12-25',
    '2027-01-01','2027-01-11','2027-03-22','2027-03-25','2027-03-26','2027-05-01','2027-05-10','2027-05-31','2027-06-07',
    '2027-07-05','2027-07-20','2027-08-07','2027-08-16','2027-10-18','2027-11-01','2027-11-15','2027-12-08','2027-12-25'),
  'especiales', JSON_ARRAY()
));

-- Comprobación
SELECT JSON_LENGTH(valor, '$.festivos') AS festivos, JSON_EXTRACT(valor, '$.alta') AS alta FROM configuracion WHERE clave = 'temporadas';


-- ─────────────────────────────── 21_comprobantes.sql
-- =====================================================================
-- Comprobantes contables con el formato del contador
--
--  · centros_costo: CC-01 Alojamiento, CC-02 Restaurante y cafetería,
--    CC-03 Administración (se pueden agregar más en SOGO).
--  · asiento_lineas: centro de costo e identificación del tercero (NIT/CC)
--    de cada línea.
--  · asientos: identificación del tercero, factura que afecta y motivo
--    (notas crédito y débito).
--  · Datos del emisor que salen en cada comprobante (propietario, NIT,
--    dirección, teléfono): configuracion 'contabilidad' → emisor.
--  · Numeración (la asigna el servidor): NCO nota de contabilidad, RC recibo
--    de caja, CE comprobante de egreso, NC nota crédito, ND nota débito,
--    con el año y el consecutivo: RC-2026001. Los comprobantes ya
--    registrados conservan su número.
--
-- Solo AGREGA columnas, tablas y filas: la página web sigue igual.
-- Ejecutar una vez, completo (rayo sin seleccionar nada), después del 20.
-- =====================================================================

SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

CREATE TABLE IF NOT EXISTS centros_costo (
  codigo  VARCHAR(10)  NOT NULL,
  nombre  VARCHAR(80)  NOT NULL,
  activo  TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO centros_costo (codigo, nombre) VALUES
  ('CC-01', 'Alojamiento'),
  ('CC-02', 'Restaurante y cafetería'),
  ('CC-03', 'Administración');

ALTER TABLE asiento_lineas
  ADD COLUMN centro_costo        VARCHAR(10) DEFAULT NULL,
  ADD COLUMN tercero_documento   VARCHAR(30) DEFAULT NULL;

ALTER TABLE asientos
  ADD COLUMN tercero_documento   VARCHAR(30) DEFAULT NULL,
  ADD COLUMN factura_afecta      VARCHAR(40) DEFAULT NULL,
  ADD COLUMN motivo_nota         VARCHAR(30) DEFAULT NULL;   -- Error | Devolución | Rebaja | Anulación (NC) / cobro adicional (ND)

-- Las líneas ya registradas toman el centro de costo según su origen
UPDATE asiento_lineas l JOIN asientos a ON a.id = l.asiento_id
   SET l.centro_costo = CASE WHEN a.origen IN ('Reservas', 'Alojamiento', 'Facturación') THEN 'CC-01' ELSE 'CC-03' END
 WHERE l.centro_costo IS NULL;

-- Datos del emisor en los comprobantes
UPDATE configuracion SET valor = JSON_SET(valor, '$.emisor', JSON_OBJECT(
    'nombre', 'Hospedaje Sebastián',
    'propietario', 'Guillermo Pinilla Hurtado',
    'nit', '7.511.827-2',
    'direccion', 'Cra 3 # 5-65, piso 2 · Filandia, Quindío',
    'telefono', '311 340 8867'))
 WHERE clave = 'contabilidad' AND JSON_EXTRACT(valor, '$.emisor') IS NULL;

-- Cuenta de la comisión de Booking (en el plan de la hoja: 233520 Comisiones)
UPDATE cuentas_puc SET nombre = 'Comisiones por pagar' WHERE codigo = '233520';

-- ── Comprobación ────────────────────────────────────────────────────
SELECT * FROM centros_costo;
SELECT centro_costo, COUNT(*) AS lineas FROM asiento_lineas GROUP BY centro_costo;
SELECT JSON_EXTRACT(valor, '$.emisor') AS emisor FROM configuracion WHERE clave = 'contabilidad';


-- ─────────────────────────────── 23_facturacion.sql
-- =====================================================================
-- 23 · Facturación electrónica guardada en la base de datos
--   · Las facturas, sus líneas y su historial ya tenían tablas (script 01);
--     se agregan los campos que faltaban para guardarlas desde SOGO.
--   · Datos del hospedaje (configuracion 'hospedaje'): los usan Facturación,
--     Contabilidad, Nómina, TRA y Reportes. Se cargan los datos públicos de
--     la página web; el NIT y el RNT quedan vacíos para escribirlos en
--     Configuración › Datos del hospedaje.
--   · Configuración de facturación (configuracion 'facturacion'): resolución,
--     proveedor tecnológico, tarifas de impuestos y plantilla de correo.
-- Solo agrega: no borra ni cambia datos existentes. Se puede ejecutar dos veces.
-- =====================================================================

-- 1. Campos nuevos de facturas -------------------------------------------
DROP PROCEDURE IF EXISTS sogo_agregar_columna;
DELIMITER //
CREATE PROCEDURE sogo_agregar_columna(IN tabla VARCHAR(64), IN columna VARCHAR(64), IN definicion VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tabla AND COLUMN_NAME = columna) THEN
    SET @sql = CONCAT('ALTER TABLE ', tabla, ' ADD COLUMN ', columna, ' ', definicion);
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
DELIMITER ;

CALL sogo_agregar_columna('facturas', 'datos_validados_at', 'DATETIME DEFAULT NULL');            -- validación de datos fiscales en SOGO
CALL sogo_agregar_columna('facturas', 'creado_por_nombre', 'VARCHAR(120) DEFAULT NULL');
CALL sogo_agregar_columna('facturas', 'emitida_por_nombre', 'VARCHAR(120) DEFAULT NULL');
CALL sogo_agregar_columna('facturas', 'anulada_por_nombre', 'VARCHAR(120) DEFAULT NULL');
CALL sogo_agregar_columna('facturas', 'actualizado_at', 'DATETIME DEFAULT NULL');
DROP PROCEDURE sogo_agregar_columna;

-- Un borrador puede guardarse antes de tener el comprador completo
ALTER TABLE facturas MODIFY tercero_id BIGINT NULL;

-- 2. Datos del hospedaje (solo si aún no existen) ---------------------------
INSERT IGNORE INTO configuracion (clave, valor) VALUES ('hospedaje', JSON_OBJECT(
  'commercialName', 'Hospedaje Sebastián Filandia',
  'legalName',      '',
  'nit',            '',
  'rnt',            '',
  'establishment',  'Vivienda turística',
  'address',        'Carrera 3ra #5-65',
  'municipality',   'Filandia, Quindío · Colombia',
  'phone',          '+57 311 340 8867',
  'mobile',         '+57 314 755 6717',
  'email',          'hospedajesebastianfilandia@gmail.com',
  'website',        '',
  'logo',           NULL,
  'currency',       'Peso colombiano (COP)',
  'timezone',       'America/Bogota (UTC-5)',
  'dateFormat',     'dd/mm/aaaa',
  'language',       'Español',
  'thousands',      'Punto · $ 1.234.567',
  'weekStart',      'Lunes'
));

-- 3. Configuración de facturación (solo si aún no existe) ------------------
-- Sin resolución ni proveedor: se completan en Facturación › Configuración
-- con los datos que entrega la DIAN y el proveedor tecnológico.
INSERT IGNORE INTO configuracion (clave, valor) VALUES ('facturacion', JSON_OBJECT(
  'provider', JSON_OBJECT('name', '', 'apiUrl', '', 'environment', 'Habilitación', 'clientId', '', 'apiKey', '', 'lastResponse', '', 'connected', FALSE),
  'resolution', JSON_OBJECT('number', '', 'prefix', 'FE', 'from', 1, 'to', 1000, 'validFrom', NULL, 'validTo', NULL, 'technicalKey', '', 'creditPrefix', 'NCE'),
  'taxes', JSON_ARRAY(
    JSON_OBJECT('id', 't1', 'concept', 'Alojamiento', 'kind', 'IVA', 'rate', 0.19, 'condition', 'General', 'status', 'Validar con contador'),
    JSON_OBJECT('id', 't2', 'concept', 'Alojamiento · extranjero no residente', 'kind', 'IVA', 'rate', 0, 'condition', 'Pasaporte y sin residencia en Colombia', 'status', 'Validar con contador'),
    JSON_OBJECT('id', 't3', 'concept', 'Daños y faltantes', 'kind', 'IVA', 'rate', 0, 'condition', 'Reposición (indemnización), no es una venta', 'status', 'Validar con contador'),
    JSON_OBJECT('id', 't4', 'concept', 'Eventos y pasadías', 'kind', 'IVA', 'rate', 0.19, 'condition', 'General', 'status', 'Validar con contador'),
    JSON_OBJECT('id', 't5', 'concept', 'Lavandería', 'kind', 'IVA', 'rate', 0.19, 'condition', 'General', 'status', 'Validar con contador'),
    JSON_OBJECT('id', 't6', 'concept', 'Otro', 'kind', 'IVA', 'rate', 0.19, 'condition', 'General', 'status', 'Validar con contador')
  ),
  'automation', JSON_OBJECT('emailOnAccept', TRUE),
  'emailSubject', 'Factura electrónica {número} · {hospedaje}',
  'emailBody', 'Hola {huésped}, gracias por hospedarte con nosotros. Adjuntamos la factura electrónica {número} de tu estadía del {fechas}, por {total}. Cualquier inquietud, responde a este correo.'
));

-- 4. Verificación -----------------------------------------------------------
SELECT clave, JSON_UNQUOTE(JSON_EXTRACT(valor, '$.commercialName')) AS hospedaje FROM configuracion WHERE clave IN ('hospedaje', 'facturacion');
SELECT COUNT(*) AS facturas FROM facturas;


-- ─────────────────────────────── 24_soportes_archivos.sql
-- =====================================================================
-- 24 · Documentos soporte de Contabilidad guardados en la base de datos
--   Hasta ahora `asiento_soportes` solo guardaba el nombre del archivo.
--   Desde este script guarda también el archivo (PDF o imagen, máx. 5 MB):
--   se abre desde Contabilidad › Comprobantes › detalle del comprobante.
--   Las filas sin archivo (referencias que pone la integración, p. ej.
--   "Recibo 123" o "FE-1.pdf") siguen igual.
-- Solo agrega columnas: no borra ni cambia datos. Se puede ejecutar dos veces.
-- =====================================================================

DROP PROCEDURE IF EXISTS sogo_agregar_columna;
DELIMITER //
CREATE PROCEDURE sogo_agregar_columna(IN tabla VARCHAR(64), IN columna VARCHAR(64), IN definicion VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tabla AND COLUMN_NAME = columna) THEN
    SET @sql = CONCAT('ALTER TABLE ', tabla, ' ADD COLUMN ', columna, ' ', definicion);
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
DELIMITER ;

CALL sogo_agregar_columna('asiento_soportes', 'tipo_mime', 'VARCHAR(100) DEFAULT NULL');      -- application/pdf, image/jpeg...
CALL sogo_agregar_columna('asiento_soportes', 'tamano', 'INT DEFAULT NULL');                  -- bytes
CALL sogo_agregar_columna('asiento_soportes', 'contenido', 'LONGBLOB DEFAULT NULL');          -- el archivo
CALL sogo_agregar_columna('asiento_soportes', 'subido_por_nombre', 'VARCHAR(120) DEFAULT NULL');
DROP PROCEDURE sogo_agregar_columna;

-- Verificación: soportes con archivo y solo con nombre
SELECT COUNT(*) AS soportes, SUM(contenido IS NOT NULL) AS con_archivo, SUM(contenido IS NULL) AS solo_nombre FROM asiento_soportes;


-- ─────────────────────────────── 25_reservas_pagos_y_tra.sql
-- =====================================================================
-- 25 · Cobro y estado de las reservas + TRA guardada en la base de datos
--   · Políticas de reserva (configuracion 'politicas_reserva'): abono para
--     confirmar, horas de check-in/out, cancelación y pasadías. Antes vivían
--     solo en memoria. Se cargan los valores que SOGO mostraba; se cambian en
--     Configuración › Alojamiento y reservas.
--   · TRA: cada tarjeta (huésped principal, acompañantes, unidades, envíos e
--     historial) se guarda en tra_registros.datos. Antes se perdía al recargar.
-- Solo agrega: no borra ni cambia datos. Se puede ejecutar dos veces.
-- =====================================================================

DROP PROCEDURE IF EXISTS sogo_agregar_columna;
DELIMITER //
CREATE PROCEDURE sogo_agregar_columna(IN tabla VARCHAR(64), IN columna VARCHAR(64), IN definicion VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tabla AND COLUMN_NAME = columna) THEN
    SET @sql = CONCAT('ALTER TABLE ', tabla, ' ADD COLUMN ', columna, ' ', definicion);
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
DELIMITER ;

CALL sogo_agregar_columna('tra_registros', 'datos', 'JSON DEFAULT NULL');                         -- la TRA completa
CALL sogo_agregar_columna('tra_registros', 'actualizado_por_nombre', 'VARCHAR(120) DEFAULT NULL');
DROP PROCEDURE sogo_agregar_columna;

-- Políticas de reserva (solo si aún no existen)
INSERT IGNORE INTO configuracion (clave, valor) VALUES ('politicas_reserva', JSON_OBJECT(
  'checkIn', '15:00', 'checkOut', '12:00', 'depositPct', 50, 'freeCancelHours', 72,
  'latePenalty', 'Primera noche', 'dayPassMax', 20, 'requireTra', TRUE
));

-- Verificación
SELECT JSON_EXTRACT(valor, '$.depositPct') AS abono_para_confirmar_pct FROM configuracion WHERE clave = 'politicas_reserva';
SELECT COUNT(*) AS tra_guardadas FROM tra_registros WHERE datos IS NOT NULL;


-- ─────────────────────────────── 26_plan_de_cuentas_administracion.sql
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

