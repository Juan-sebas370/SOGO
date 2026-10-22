package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.PermisoService;
import com.sogo.service.TraService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** TRA: consultar con el permiso "ver" del módulo TRA; registrar huéspedes y envíos con "editar". */
@RestController
@RequestMapping("/api/tra")
public class TraController {

    private static final String MODULO = "TRA";

    private final TraService tra;
    private final PermisoService permisos;

    public TraController(TraService tra, PermisoService permisos) {
        this.tra = tra;
        this.permisos = permisos;
    }

    @GetMapping("/registros")
    public List<JsonNode> listar(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return tra.listar();
    }

    @PutMapping("/registros/{reservaId}")
    public JsonNode guardar(@PathVariable long reservaId, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return tra.guardar(reservaId, body, permisos.nombre(user));
    }
}
