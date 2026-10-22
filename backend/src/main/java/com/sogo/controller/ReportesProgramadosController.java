package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.ConfiguracionService;
import com.sogo.service.PermisoService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.regex.Pattern;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

/**
 * Reportes programados (Reportes › Programados), guardados en configuracion 'reportes_programados'.
 * Consultar: permiso "ver" de Reportes; crear, editar, pausar o eliminar: "crear".
 */
@RestController
@RequestMapping("/api/reportes/programados")
public class ReportesProgramadosController {

    private static final String CLAVE = "reportes_programados";
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");

    private final ConfiguracionService config;
    private final PermisoService permisos;

    public ReportesProgramadosController(ConfiguracionService config, PermisoService permisos) {
        this.config = config;
        this.permisos = permisos;
    }

    @GetMapping
    public JsonNode listar(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Reportes", "view");
        return config.leer(CLAVE).orElse(null);
    }

    @PutMapping
    public JsonNode guardar(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Reportes", "create");
        if (!(body instanceof ObjectNode) || !body.path("schedules").isArray()) throw new ResponseStatusException(BAD_REQUEST, "Faltan las programaciones");
        for (JsonNode s : body.path("schedules")) {
            if (s.path("name").asText("").isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Hay una programación sin nombre");
            if (!s.path("time").asText("").matches("[0-9]{2}:[0-9]{2}")) throw new ResponseStatusException(BAD_REQUEST, "La hora de «" + s.path("name").asText() + "» no es válida");
            if (!s.path("recipients").isArray() || s.path("recipients").isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "«" + s.path("name").asText() + "» no tiene destinatarios");
            for (JsonNode d : s.path("recipients")) {
                if (!EMAIL.matcher(d.asText("")).matches()) throw new ResponseStatusException(BAD_REQUEST, "«" + d.asText() + "» no es un correo válido");
            }
        }
        return config.guardar(CLAVE, body, permisos.usuarioId(user));
    }
}
