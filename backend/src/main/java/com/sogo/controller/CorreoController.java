package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.AlertaCorreoService;
import com.sogo.service.CorreoService;
import com.sogo.service.PermisoService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

/**
 * Estado del correo de SOGO (cuenta de backend/correo.local.properties) y correo de prueba.
 * La contraseña nunca sale del servidor.
 */
@RestController
@RequestMapping("/api/correo")
public class CorreoController {

    private final CorreoService correo;
    private final PermisoService permisos;
    private final AlertaCorreoService alertas;

    public CorreoController(CorreoService correo, PermisoService permisos, AlertaCorreoService alertas) {
        this.correo = correo;
        this.permisos = permisos;
        this.alertas = alertas;
    }

    /** Últimos avisos de alertas enviados por correo (Configuración › Notificaciones). */
    @GetMapping("/alertas")
    public JsonNode alertas(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Configuración", "view");
        return alertas.historial();
    }

    /** Revisa las alertas ya (sin esperar los 5 minutos) y envía lo pendiente. */
    @PostMapping("/alertas/revisar")
    public JsonNode revisarAlertas(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Configuración", "edit");
        if (!correo.configurado()) throw new ResponseStatusException(BAD_REQUEST, "No se puede enviar: " + correo.faltante());
        alertas.revisar(java.time.LocalDateTime.now());
        return alertas.historial();
    }

    @GetMapping("/estado")
    public Map<String, Object> estado() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("configured", correo.configurado());
        m.put("account", correo.cuenta());
        m.put("host", correo.servidor());
        m.put("sender", correo.remitente());
        m.put("missing", correo.faltante());
        m.put("lastError", correo.ultimoError());
        return m;
    }

    @PostMapping("/prueba")
    public Map<String, Object> prueba(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Configuración", "edit");
        String para = body.path("to").asText("").trim();
        if (!para.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$")) throw new ResponseStatusException(BAD_REQUEST, "Escribe un correo válido para la prueba");
        String error = correo.probar(para);
        if (!error.isEmpty()) throw new ResponseStatusException(BAD_GATEWAY, error);
        return Map.of("ok", true, "to", para);
    }
}
