-- =====================================================================
-- Reparación: completa lo que no se aplicó de 01_estructura_sogo.sql
-- cuando falló el ALTER TABLE reservas.
-- Ejecuta este archivo POR PARTES (selecciona cada bloque y ejecútalo
-- con el rayo), mirando el resultado de cada uno.
-- =====================================================================
USE hotel_sebastian;
SET SQL_SAFE_UPDATES = 0;

-- ---------------------------------------------------------------------
-- PARTE A — Diagnóstico. Envíame lo que salga aquí.
-- ---------------------------------------------------------------------
-- A1. Reservas que apuntan a una habitación que ya no existe
SELECT r.id, r.habitacion_id, r.nombre_huesped, r.fecha_ingreso
FROM reservas r LEFT JOIN habitaciones h ON h.id = r.habitacion_id
WHERE r.habitacion_id IS NOT NULL AND h.id IS NULL;

-- A2. reserva_habitaciones con habitaciones que no existen
SELECT rh.reserva_id, rh.habitacion_id
FROM reserva_habitaciones rh LEFT JOIN habitaciones h ON h.id = rh.habitacion_id
WHERE rh.habitacion_id IS NOT NULL AND h.id IS NULL;

-- A3. Qué columnas nuevas quedaron creadas en cada tabla que se amplió
SELECT table_name, GROUP_CONCAT(column_name ORDER BY column_name) AS columnas_nuevas
FROM information_schema.columns
WHERE table_schema = 'hotel_sebastian'
  AND ((table_name = 'usuarios'     AND column_name IN ('username','estado','intentos_fallidos'))
    OR (table_name = 'empleados'    AND column_name IN ('numero_documento','eps','estado'))
    OR (table_name = 'habitaciones' AND column_name IN ('camas','tipo_bano','activa'))
    OR (table_name = 'reservas'     AND column_name IN ('codigo','huesped_id','canal'))
    OR (table_name = 'pagos'        AND column_name IN ('origen','comprobante')))
GROUP BY table_name;

-- ---------------------------------------------------------------------
-- PARTE B — Columnas e índices de reservas (sin llaves foráneas, para
-- que datos viejos no lo bloqueen)
-- ---------------------------------------------------------------------
ALTER TABLE reservas
  ADD COLUMN codigo                  VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN huesped_id              BIGINT        DEFAULT NULL,
  ADD COLUMN canal                   VARCHAR(20)   NOT NULL DEFAULT 'Web',
  ADD COLUMN ciudad                  VARCHAR(80)   DEFAULT NULL,
  ADD COLUMN plan                    VARCHAR(80)   DEFAULT NULL,
  ADD COLUMN paquete_id              BIGINT        DEFAULT NULL,
  ADD COLUMN promocion_id            BIGINT        DEFAULT NULL,
  ADD COLUMN valor_extras            DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN checkin_at              DATETIME      DEFAULT NULL,
  ADD COLUMN checkout_at             DATETIME      DEFAULT NULL,
  ADD COLUMN motivo_cancelacion      VARCHAR(255)  DEFAULT NULL,
  ADD COLUMN consentimiento_datos_at DATETIME      DEFAULT NULL,
  ADD COLUMN creado_por              BIGINT        DEFAULT NULL,
  ADD UNIQUE KEY uk_reservas_codigo (codigo),
  ADD KEY idx_reservas_fechas (fecha_ingreso, fecha_salida),
  ADD KEY idx_reservas_estado (estado),
  ADD KEY idx_reservas_habitacion (habitacion_id);

-- Llaves foráneas que no dependen de datos viejos
ALTER TABLE reservas
  ADD CONSTRAINT fk_reservas_huesped    FOREIGN KEY (huesped_id)   REFERENCES huespedes (id),
  ADD CONSTRAINT fk_reservas_paquete    FOREIGN KEY (paquete_id)   REFERENCES paquetes (id),
  ADD CONSTRAINT fk_reservas_promocion  FOREIGN KEY (promocion_id) REFERENCES promociones (id),
  ADD CONSTRAINT fk_reservas_creado_por FOREIGN KEY (creado_por)   REFERENCES usuarios (id);

-- ---------------------------------------------------------------------
-- PARTE C — Triggers de sincronización con la web
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- PARTE D — Completar las reservas que ya existían
-- (los huéspedes ya se crearon en la primera ejecución)
-- ---------------------------------------------------------------------
UPDATE reservas r
JOIN huespedes h ON h.tipo_documento = COALESCE(r.tipo_documento, 'CC')
                AND h.numero_documento = r.numero_documento
SET r.huesped_id = h.id
WHERE r.huesped_id IS NULL;

INSERT IGNORE INTO reserva_huespedes (reserva_id, huesped_id, rol, habitacion_id)
SELECT r.id, r.huesped_id, 'PRINCIPAL', h.id
FROM reservas r LEFT JOIN habitaciones h ON h.id = r.habitacion_id
WHERE r.huesped_id IS NOT NULL;

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

-- ---------------------------------------------------------------------
-- PARTE E — Llaves hacia habitaciones. SOLO cuando A1 y A2 salgan
-- vacías (después de corregir esas reservas). Si fallan, no pasa nada:
-- todo lo anterior ya queda funcionando.
-- ---------------------------------------------------------------------
-- ALTER TABLE reservas
--   ADD CONSTRAINT fk_reservas_habitacion FOREIGN KEY (habitacion_id) REFERENCES habitaciones (id);
-- ALTER TABLE reserva_habitaciones
--   ADD KEY idx_reserva_habitaciones_hab (habitacion_id),
--   ADD CONSTRAINT fk_reserva_habitaciones_hab FOREIGN KEY (habitacion_id) REFERENCES habitaciones (id);
