-- =====================================================================
-- Triggers de sincronización con la web.
-- Ejecuta este archivo COMPLETO: sin seleccionar nada, pulsa el rayo
-- (Query → Execute All, Ctrl+Shift+Enter). Se puede repetir sin problema.
-- =====================================================================
USE hotel_sebastian;

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
