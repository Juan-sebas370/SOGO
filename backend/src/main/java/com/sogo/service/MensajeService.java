package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.format.DateTimeFormatter;
import java.util.*;

import static org.springframework.http.HttpStatus.*;

/**
 * Mensajes que llegan por el formulario de Contacto de la página web (tabla `contactos`, la
 * crea la web) y sus respuestas desde SOGO (`contacto_respuestas`), más las respuestas rápidas
 * (`respuestas_rapidas`). La web sigue usando sus estados: crea 'nuevo' y entiende 'respondido'.
 */
@Service
public class MensajeService {

    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    static final List<String> ESTADOS = List.of("nuevo", "leido", "respondido", "archivado");
    static final List<String> PRIORIDADES = List.of("baja", "normal", "alta");
    static final List<String> CANALES = List.of("Correo", "WhatsApp", "Llamada");
    static final List<String> CATEGORIAS = List.of("reserva", "servicio", "precio", "evento", "queja", "sugerencia", "otro");

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public MensajeService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    // ── Mensajes ─────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ObjectNode> mensajes() {
        Map<Long, ArrayNode> respuestas = new HashMap<>();
        jdbc.query("SELECT * FROM contacto_respuestas ORDER BY creado_at, id", rs -> {
            ObjectNode r = json.createObjectNode();
            r.put("channel", rs.getString("canal"));
            r.put("text", rs.getString("texto"));
            r.put("by", nz(rs.getString("usuario_nombre")));
            r.put("at", fecha(rs.getTimestamp("creado_at")));
            respuestas.computeIfAbsent(rs.getLong("contacto_id"), k -> json.createArrayNode()).add(r);
        });
        return jdbc.query("SELECT * FROM contactos ORDER BY fecha_creacion DESC, id DESC", (rs, i) -> {
            ObjectNode o = mensaje(rs);
            ArrayNode h = respuestas.get(rs.getLong("id"));
            if (h == null && rs.getString("respuesta") != null) {
                // Respondido antes de SOGO (desde la web): se muestra como una respuesta
                h = json.createArrayNode();
                ObjectNode r = h.addObject();
                r.put("channel", nz(rs.getString("canal_respuesta")).isEmpty() ? "Correo" : rs.getString("canal_respuesta"));
                r.put("text", rs.getString("respuesta"));
                r.put("by", nz(rs.getString("respondido_por_nombre")));
                r.put("at", fecha(rs.getTimestamp("fecha_respuesta")));
            }
            o.set("replies", h == null ? json.createArrayNode() : h);
            return o;
        });
    }

    private ObjectNode mensaje(ResultSet rs) throws SQLException {
        ObjectNode o = json.createObjectNode();
        o.put("id", rs.getLong("id"));
        o.put("name", nz(rs.getString("nombre")));
        o.put("email", nz(rs.getString("email")));
        o.put("phone", nz(rs.getString("telefono")));
        o.put("subject", nz(rs.getString("asunto")));
        o.put("message", nz(rs.getString("mensaje")));
        o.put("category", nz(rs.getString("categoria")).isEmpty() ? nz(rs.getString("asunto")) : rs.getString("categoria"));
        o.put("priority", nz(rs.getString("prioridad")).isEmpty() ? "normal" : rs.getString("prioridad"));
        o.put("status", nz(rs.getString("estado")).isEmpty() ? "nuevo" : rs.getString("estado"));
        o.put("createdAt", fecha(rs.getTimestamp("fecha_creacion")));
        o.put("readAt", fecha(rs.getTimestamp("leido_at")));
        o.put("readBy", nz(rs.getString("leido_por_nombre")));
        o.put("answeredAt", fecha(rs.getTimestamp("fecha_respuesta")));
        o.put("answeredBy", nz(rs.getString("respondido_por_nombre")));
        o.put("channel", nz(rs.getString("canal_respuesta")));
        return o;
    }

    private ObjectNode uno(long id) {
        return mensajes().stream().filter(m -> m.path("id").asLong() == id).findFirst()
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "El mensaje no existe"));
    }

    /** Al abrir un mensaje nuevo queda leído (quién y cuándo). */
    @Transactional
    public ObjectNode leer(long id, String nombre) {
        int n = jdbc.update("UPDATE contactos SET estado = 'leido', leido_at = NOW(), leido_por_nombre = ?, fecha_modificacion = NOW() "
                + "WHERE id = ? AND (estado IS NULL OR estado = 'nuevo')", nombre, id);
        if (n == 0) jdbc.update("UPDATE contactos SET leido_at = COALESCE(leido_at, NOW()), leido_por_nombre = COALESCE(leido_por_nombre, ?) WHERE id = ?", nombre, id);
        return uno(id);
    }

    /** Cambia el estado (archivar, reabrir, volver a nuevo) o la prioridad. */
    @Transactional
    public ObjectNode actualizar(long id, JsonNode b) {
        uno(id);
        if (b.has("status")) {
            String e = b.path("status").asText("");
            if (!ESTADOS.contains(e)) throw new ResponseStatusException(BAD_REQUEST, "Estado no válido");
            jdbc.update("UPDATE contactos SET estado = ?, fecha_modificacion = NOW() WHERE id = ?", e, id);
        }
        if (b.has("priority")) {
            String p = b.path("priority").asText("");
            if (!PRIORIDADES.contains(p)) throw new ResponseStatusException(BAD_REQUEST, "Prioridad no válida");
            jdbc.update("UPDATE contactos SET prioridad = ?, fecha_modificacion = NOW() WHERE id = ?", p, id);
        }
        return uno(id);
    }

    /**
     * Registra la respuesta (el texto que se envió por correo, WhatsApp o por llamada) y deja el
     * mensaje respondido. También llena `respuesta` y `fecha_respuesta`, que lee la página web.
     */
    @Transactional
    public ObjectNode responder(long id, JsonNode b, Long uid, String nombre) {
        uno(id);
        String canal = b.path("channel").asText("");
        String texto = b.path("text").asText("").trim();
        if (!CANALES.contains(canal)) throw new ResponseStatusException(BAD_REQUEST, "Canal no válido");
        if (texto.length() < 5) throw new ResponseStatusException(BAD_REQUEST, "Escribe la respuesta");
        if (texto.length() > 5000) throw new ResponseStatusException(BAD_REQUEST, "La respuesta es demasiado larga (máximo 5.000 caracteres)");
        Long plantilla = b.hasNonNull("templateId") ? b.path("templateId").asLong() : null;
        jdbc.update("INSERT INTO contacto_respuestas (contacto_id, canal, texto, plantilla_id, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?, ?)",
                id, canal, texto, plantilla, uid, nombre);
        jdbc.update("UPDATE contactos SET respuesta = ?, estado = 'respondido', fecha_respuesta = NOW(), fecha_modificacion = NOW(), "
                + "respondido_por_usuario = ?, respondido_por_nombre = ?, canal_respuesta = ?, leido_at = COALESCE(leido_at, NOW()) WHERE id = ?",
                texto, uid, nombre, canal, id);
        if (plantilla != null) jdbc.update("UPDATE respuestas_rapidas SET usos = usos + 1 WHERE id = ?", plantilla);
        return uno(id);
    }

    @Transactional(readOnly = true)
    public int nuevos() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM contactos WHERE estado IS NULL OR estado = 'nuevo'", Integer.class);
        return n == null ? 0 : n;
    }

    // ── Respuestas rápidas ───────────────────────────────

    @Transactional(readOnly = true)
    public List<ObjectNode> plantillas() {
        return jdbc.query("SELECT * FROM respuestas_rapidas ORDER BY categoria, titulo", (rs, i) -> {
            ObjectNode o = json.createObjectNode();
            o.put("id", rs.getLong("id"));
            o.put("title", rs.getString("titulo"));
            o.put("category", rs.getString("categoria"));
            o.put("text", rs.getString("texto"));
            o.put("active", rs.getBoolean("activa"));
            o.put("uses", rs.getInt("usos"));
            o.put("updatedAt", fecha(rs.getTimestamp("actualizado_at")));
            o.put("updatedBy", nz(rs.getString("actualizado_por")));
            return o;
        });
    }

    /** Crea (sin id) o edita una respuesta rápida. */
    @Transactional
    public ObjectNode guardarPlantilla(JsonNode b, String nombre) {
        String titulo = b.path("title").asText("").trim();
        String categoria = b.path("category").asText("otro");
        String texto = b.path("text").asText("").trim();
        if (titulo.length() < 3 || titulo.length() > 120) throw new ResponseStatusException(BAD_REQUEST, "El título debe tener entre 3 y 120 caracteres");
        if (!CATEGORIAS.contains(categoria)) throw new ResponseStatusException(BAD_REQUEST, "Categoría no válida");
        if (texto.length() < 10) throw new ResponseStatusException(BAD_REQUEST, "Escribe el texto de la respuesta");
        boolean activa = b.path("active").asBoolean(true);
        try {
            if (b.hasNonNull("id")) {
                int n = jdbc.update("UPDATE respuestas_rapidas SET titulo = ?, categoria = ?, texto = ?, activa = ?, actualizado_at = NOW(), actualizado_por = ? WHERE id = ?",
                        titulo, categoria, texto, activa, nombre, b.path("id").asLong());
                if (n == 0) throw new ResponseStatusException(NOT_FOUND, "La respuesta rápida no existe");
            } else {
                jdbc.update("INSERT INTO respuestas_rapidas (titulo, categoria, texto, activa, actualizado_at, actualizado_por) VALUES (?, ?, ?, ?, NOW(), ?)",
                        titulo, categoria, texto, activa, nombre);
            }
        } catch (DuplicateKeyException e) {
            throw new ResponseStatusException(CONFLICT, "Ya existe una respuesta rápida con el título «" + titulo + "»");
        }
        return plantillas().stream().filter(p -> p.path("title").asText().equals(titulo)).findFirst().orElseThrow();
    }

    @Transactional
    public void eliminarPlantilla(long id) {
        if (jdbc.update("DELETE FROM respuestas_rapidas WHERE id = ?", id) == 0) throw new ResponseStatusException(NOT_FOUND, "La respuesta rápida no existe");
    }

    private static String fecha(Timestamp t) { return t == null ? "" : t.toLocalDateTime().format(MINUTO); }

    private static String nz(String s) { return s == null ? "" : s; }
}
