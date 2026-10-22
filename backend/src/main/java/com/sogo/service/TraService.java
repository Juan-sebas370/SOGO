package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.springframework.http.HttpStatus.*;

/**
 * TRA (Tarjeta de Registro de Alojamiento) guardada en la base de datos: un registro por reserva
 * en `tra_registros`, con el estado en su columna y el detalle completo (unidades, huésped
 * principal, acompañantes, envíos e historial) en `datos` (JSON), con la misma forma que usa SOGO.
 * Una TRA reportada al MinCIT ya no se modifica.
 */
@Service
public class TraService {

    private static final Set<String> ESTADOS = Set.of("BORRADOR", "REQUIERE_CORRECCION", "LISTA_PARA_ENVIO", "ENVIANDO", "REPORTADA", "ERROR");

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public TraService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public List<JsonNode> listar() {
        List<JsonNode> out = new ArrayList<>();
        jdbc.query("SELECT reserva_id, estado, CAST(datos AS CHAR) AS datos FROM tra_registros WHERE datos IS NOT NULL ORDER BY reserva_id", rs -> {
            try {
                ObjectNode o = (ObjectNode) json.readTree(rs.getString("datos"));
                o.put("reservationId", String.valueOf(rs.getLong("reserva_id")));
                o.put("status", rs.getString("estado"));
                out.add(o);
            } catch (Exception e) {
                // Un registro ilegible no impide ver los demás
            }
        });
        return out;
    }

    /** Crea o reemplaza la TRA de la reserva. */
    public JsonNode guardar(long reservaId, JsonNode body, String nombre) {
        if (!(body instanceof ObjectNode rec)) throw new ResponseStatusException(BAD_REQUEST, "TRA no válida");
        Integer existe = jdbc.queryForObject("SELECT COUNT(*) FROM reservas WHERE id = ?", Integer.class, reservaId);
        if (existe == null || existe == 0) throw new ResponseStatusException(NOT_FOUND, "No existe la reserva " + reservaId);

        String estado = rec.path("status").asText("BORRADOR");
        if (!ESTADOS.contains(estado)) throw new ResponseStatusException(BAD_REQUEST, "Estado de TRA no válido: " + estado);
        if (!rec.path("guests").isArray() || rec.path("guests").isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "La TRA debe tener al menos el huésped principal");
        if (!rec.path("units").isArray()) throw new ResponseStatusException(BAD_REQUEST, "Faltan las unidades de alojamiento de la TRA");

        List<String> previo = jdbc.queryForList("SELECT estado FROM tra_registros WHERE reserva_id = ?", String.class, reservaId);
        if (!previo.isEmpty() && "REPORTADA".equals(previo.get(0)) && !"REPORTADA".equals(estado))
            throw new ResponseStatusException(CONFLICT, "La TRA de esta reserva ya fue reportada al MinCIT y no se modifica");

        ObjectNode datos = rec.deepCopy();
        datos.remove("reservationId");
        datos.remove("status");
        String checkIn = rec.path("checkInAt").asText("");
        Object checkInAt = checkIn.length() >= 16 ? java.sql.Timestamp.valueOf(checkIn.substring(0, 16).replace('T', ' ') + ":00") : null;
        jdbc.update("INSERT INTO tra_registros (reserva_id, estado, checkin_at, datos, actualizado_por_nombre) VALUES (?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE estado = VALUES(estado), checkin_at = VALUES(checkin_at), datos = VALUES(datos), "
                        + "actualizado_por_nombre = VALUES(actualizado_por_nombre)",
                reservaId, estado, checkInAt, datos.toString(), nombre == null ? null : nombre.substring(0, Math.min(120, nombre.length())));
        ObjectNode r = datos.deepCopy();
        r.put("reservationId", String.valueOf(reservaId));
        r.put("status", estado);
        return r;
    }
}
