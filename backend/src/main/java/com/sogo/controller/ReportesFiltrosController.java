package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.ConfiguracionService;
import com.sogo.service.PermisoService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

import static org.springframework.http.HttpStatus.*;

/**
 * Filtros guardados de Reportes › Filtros avanzados, en configuracion 'reportes_filtros'.
 * Quien puede ver Reportes guarda sus filtros; los elimina su autor o quien puede crear en Reportes.
 */
@RestController
@RequestMapping("/api/reportes/filtros")
public class ReportesFiltrosController {

    private static final String CLAVE = "reportes_filtros";
    private static final int MAXIMO = 100;

    private final ConfiguracionService config;
    private final PermisoService permisos;
    private final ObjectMapper json;

    public ReportesFiltrosController(ConfiguracionService config, PermisoService permisos, ObjectMapper json) {
        this.config = config;
        this.permisos = permisos;
        this.json = json;
    }

    @GetMapping
    public JsonNode listar(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Reportes", "view");
        return filtros();
    }

    @PostMapping
    public synchronized JsonNode crear(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Reportes", "view");
        String nombre = body.path("name").asText("").trim();
        if (nombre.isEmpty() || nombre.length() > 80) throw new ResponseStatusException(BAD_REQUEST, "Escribe un nombre de hasta 80 caracteres");
        if (body.path("module").asText("").isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Falta el módulo del filtro");
        if (!body.path("values").isObject()) throw new ResponseStatusException(BAD_REQUEST, "Faltan los valores del filtro");
        ArrayNode lista = filtros();
        for (JsonNode f : lista) {
            if (f.path("name").asText("").equalsIgnoreCase(nombre)) throw new ResponseStatusException(CONFLICT, "Ya hay un filtro guardado con el nombre «" + nombre + "»");
        }
        if (lista.size() >= MAXIMO) throw new ResponseStatusException(BAD_REQUEST, "Hay " + MAXIMO + " filtros guardados: elimina alguno antes de guardar otro");
        ObjectNode f = json.createObjectNode();
        f.put("id", "f" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        f.put("name", nombre);
        f.put("module", body.path("module").asText());
        f.set("values", body.path("values"));
        f.set("range", body.has("range") ? body.path("range") : json.getNodeFactory().textNode("month"));
        if (body.path("min").isNumber()) f.set("min", body.path("min"));
        if (body.path("max").isNumber()) f.set("max", body.path("max"));
        f.put("createdBy", permisos.nombre(user));
        f.put("createdByLogin", user);
        f.put("createdAt", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));
        lista.insert(0, f);
        guardar(lista, user);
        return f;
    }

    @DeleteMapping("/{id}")
    public synchronized void eliminar(@PathVariable String id, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Reportes", "view");
        ArrayNode lista = filtros();
        for (int i = 0; i < lista.size(); i++) {
            JsonNode f = lista.get(i);
            if (!id.equals(f.path("id").asText())) continue;
            if (!user.equalsIgnoreCase(f.path("createdByLogin").asText("")) && !permisos.puede(user, "Reportes", "create")) {
                throw new ResponseStatusException(FORBIDDEN, "Solo quien guardó el filtro (o quien puede crear reportes) lo puede eliminar");
            }
            lista.remove(i);
            guardar(lista, user);
            return;
        }
        throw new ResponseStatusException(NOT_FOUND, "El filtro ya no existe");
    }

    private ArrayNode filtros() {
        JsonNode v = config.leer(CLAVE).orElse(null);
        return v != null && v.path("filters").isArray() ? (ArrayNode) v.path("filters").deepCopy() : json.createArrayNode();
    }

    private void guardar(ArrayNode lista, String user) {
        ObjectNode v = json.createObjectNode();
        v.set("filters", lista);
        config.guardar(CLAVE, v, permisos.usuarioId(user));
    }
}
