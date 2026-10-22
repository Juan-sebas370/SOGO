package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.MensajeService;
import com.sogo.service.PermisoService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Mensajes de la página web. Consultar: permiso "ver" del módulo Mensajes; responder y cambiar
 * el estado: "editar"; crear respuestas rápidas: "crear"; editarlas: "editar"; eliminarlas: "eliminar".
 */
@RestController
@RequestMapping("/api/mensajes")
public class MensajeController {

    private static final String MODULO = "Mensajes";

    private final MensajeService mensajes;
    private final PermisoService permisos;

    public MensajeController(MensajeService mensajes, PermisoService permisos) {
        this.mensajes = mensajes;
        this.permisos = permisos;
    }

    @GetMapping
    public List<ObjectNode> listar(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return mensajes.mensajes();
    }

    @GetMapping("/nuevos")
    public Map<String, Integer> nuevos(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return Map.of("count", mensajes.nuevos());
    }

    @PostMapping("/{id}/leido")
    public ObjectNode leer(@PathVariable long id, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return mensajes.leer(id, permisos.nombre(user));
    }

    @PutMapping("/{id}")
    public ObjectNode actualizar(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return mensajes.actualizar(id, body);
    }

    @PostMapping("/{id}/responder")
    public ObjectNode responder(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return mensajes.responder(id, body, permisos.usuarioId(user), permisos.nombre(user));
    }

    @GetMapping("/plantillas")
    public List<ObjectNode> plantillas(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return mensajes.plantillas();
    }

    @PutMapping("/plantillas")
    public ObjectNode guardarPlantilla(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, body.hasNonNull("id") ? "edit" : "create");
        return mensajes.guardarPlantilla(body, permisos.nombre(user));
    }

    @DeleteMapping("/plantillas/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void eliminarPlantilla(@PathVariable long id, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "delete");
        mensajes.eliminarPlantilla(id);
    }
}
