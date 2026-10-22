package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.entity.UsuarioEvento;
import com.sogo.repository.UsuarioEventoRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

/** Historial de cuentas (tabla `usuario_eventos`): estados, restablecimientos y exportaciones. */
@Service
public class UsuarioEventoService {

    public static final List<String> TIPOS = List.of("estado", "clave", "exportacion");

    private final UsuarioEventoRepository eventos;
    private final ObjectMapper json;
    private final ApplicationEventPublisher publicador;

    public UsuarioEventoService(UsuarioEventoRepository eventos, ObjectMapper json, ApplicationEventPublisher publicador) {
        this.eventos = eventos;
        this.json = json;
        this.publicador = publicador;
    }

    /** Una cuenta cambió de estado (lo escucha Nómina para mantener al empleado al día). */
    public record CambioDeEstado(String username, String de, String a, String motivo, String por) { }

    /** { statusHistory, resets, exports }: los más recientes primero, como los usa el frontend. */
    @Transactional(readOnly = true)
    public ObjectNode listar() {
        ObjectNode o = json.createObjectNode();
        ArrayNode estados = o.putArray("statusHistory"), claves = o.putArray("resets"), exportes = o.putArray("exports");
        for (UsuarioEvento e : eventos.findAllByOrderByIdDesc()) {
            try {
                JsonNode d = json.readTree(e.getDatos());
                switch (e.getTipo()) {
                    case "estado" -> estados.add(d);
                    case "clave" -> claves.add(d);
                    case "exportacion" -> exportes.add(d);
                    default -> { }
                }
            } catch (Exception ignored) { }
        }
        return o;
    }

    @Transactional
    public void registrar(String tipo, JsonNode datos) {
        if (!TIPOS.contains(tipo)) throw new ResponseStatusException(BAD_REQUEST, "Tipo de evento no válido: " + tipo);
        eventos.save(new UsuarioEvento(tipo, datos.toString()));
        if ("estado".equals(tipo)) {
            publicador.publishEvent(new CambioDeEstado(datos.path("username").asText(""), datos.path("from").asText(""),
                    datos.path("to").asText(""), datos.path("reason").asText(""), datos.path("by").asText("sistema")));
        }
    }

    /** Último bloqueo automático de una cuenta (para el desbloqueo por tiempo). */
    @Transactional(readOnly = true)
    public JsonNode ultimoCambioDeEstado(String username) {
        for (UsuarioEvento e : eventos.findAllByOrderByIdDesc()) {
            if (!"estado".equals(e.getTipo())) continue;
            try {
                JsonNode d = json.readTree(e.getDatos());
                if (username.equalsIgnoreCase(d.path("username").asText())) return d;
            } catch (Exception ignored) { }
        }
        return null;
    }
}
