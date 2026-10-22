package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

import static org.springframework.http.HttpStatus.*;

/**
 * Parámetros legales de nómina por año (tabla `parametros_nomina`) con la forma de
 * `YearParams` del frontend. Un año anterior al actual queda cerrado: lo liquidado
 * con él no cambia.
 */
@Service
public class ParametroNominaService {

    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public ParametroNominaService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public List<ObjectNode> listar() {
        int actual = LocalDate.now().getYear();
        return jdbc.query("SELECT anio, smmlv, auxilio_transporte, jornada_semanal, reglas, estado, actualizado_at, actualizado_por "
                + "FROM parametros_nomina ORDER BY anio", (rs, i) -> {
            int anio = rs.getInt("anio");
            JsonNode reglas = leer(rs.getString("reglas"));
            ObjectNode o = json.createObjectNode();
            o.put("year", anio);
            o.put("smmlv", rs.getBigDecimal("smmlv").longValue());
            o.put("transportAid", rs.getBigDecimal("auxilio_transporte").longValue());
            o.put("weeklyHours", rs.getInt("jornada_semanal"));
            o.put("extraDay", reglas.path("extraDay").asDouble(0.25));
            o.put("extraNight", reglas.path("extraNight").asDouble(0.75));
            o.put("nightSurcharge", reglas.path("nightSurcharge").asDouble(0.35));
            String estado = rs.getString("estado");
            o.put("status", anio < actual ? "Cerrado" : anio == actual ? "Vigente" : (estado == null ? "Borrador" : estado));
            Timestamp at = rs.getTimestamp("actualizado_at");
            o.put("updatedAt", at == null ? "" : at.toLocalDateTime().format(MINUTO));
            o.put("updatedBy", rs.getString("actualizado_por") == null ? "" : rs.getString("actualizado_por"));
            return o;
        });
    }

    /** Crea o actualiza los valores de un año que no esté cerrado. */
    @Transactional
    public void guardar(int anio, JsonNode d, String actor) {
        int actual = LocalDate.now().getYear();
        if (anio < actual) throw new ResponseStatusException(CONFLICT, "Los parámetros de " + anio + " están cerrados");
        if (anio > actual + 1) throw new ResponseStatusException(BAD_REQUEST, "Solo se puede preparar el año siguiente");
        long smmlv = d.path("smmlv").asLong(0);
        long auxilio = d.path("transportAid").asLong(-1);
        if (smmlv <= 0 || auxilio < 0) throw new ResponseStatusException(BAD_REQUEST, "Revisa el salario mínimo y el auxilio de transporte de " + anio);
        ObjectNode reglas = json.createObjectNode();
        for (String k : List.of("extraDay", "extraNight", "nightSurcharge")) {
            double v = d.path(k).asDouble(-1);
            if (v < 0 || v > 2) throw new ResponseStatusException(BAD_REQUEST, "Los recargos deben estar entre 0 % y 200 %");
            reglas.put(k, v);
        }
        String estado = anio == actual ? "Vigente" : ("Vigente".equals(d.path("status").asText()) ? "Vigente" : "Borrador");
        int jornada = d.path("weeklyHours").asInt(0) > 0 ? d.path("weeklyHours").asInt() : (anio >= 2026 ? 42 : 44);
        jdbc.update("INSERT INTO parametros_nomina (anio, smmlv, auxilio_transporte, jornada_semanal, reglas, estado, actualizado_at, actualizado_por) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE smmlv = VALUES(smmlv), auxilio_transporte = VALUES(auxilio_transporte), "
                        + "reglas = VALUES(reglas), estado = VALUES(estado), actualizado_at = VALUES(actualizado_at), actualizado_por = VALUES(actualizado_por)",
                anio, smmlv, auxilio, jornada, reglas.toString(), estado, Timestamp.valueOf(LocalDateTime.now()), actor);
    }

    private JsonNode leer(String s) {
        try { return s == null ? json.createObjectNode() : json.readTree(s); } catch (Exception e) { return json.createObjectNode(); }
    }
}
