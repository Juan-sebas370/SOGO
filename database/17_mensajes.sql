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
USE hotel_sebastian;
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
