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

USE hotel_sebastian;
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
