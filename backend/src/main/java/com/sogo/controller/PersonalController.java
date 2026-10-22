package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;

/**
 * Usuarios y roles, empleados, nóminas, auditoría y configuración de SOGO.
 * Leer: cualquier sesión. Escribir: según los permisos del rol (los verifica PermisoService).
 */
@RestController
@RequestMapping("/api")
public class PersonalController {

    /** Ajustes que se pueden guardar desde Configuración. */
    private static final Set<String> AJUSTES = Set.of("seguridad", "auditoria", "importacion_demo", "nomina_tasas", "inventario_alertas", "hospedaje", "politicas_reserva", "tra", "notificaciones", "metas", "politica_datos");

    private final PermisoService permisos;
    private final RolService roles;
    private final CuentaService cuentas;
    private final EmpleadoService empleados;
    private final NominaService nominas;
    private final AuditoriaService auditoria;
    private final UsuarioEventoService eventos;
    private final ConfiguracionService config;
    private final ParametroNominaService parametros;

    public PersonalController(PermisoService permisos, RolService roles, CuentaService cuentas, EmpleadoService empleados,
                              NominaService nominas, AuditoriaService auditoria, UsuarioEventoService eventos, ConfiguracionService config,
                              ParametroNominaService parametros) {
        this.permisos = permisos;
        this.roles = roles;
        this.cuentas = cuentas;
        this.empleados = empleados;
        this.nominas = nominas;
        this.auditoria = auditoria;
        this.eventos = eventos;
        this.config = config;
        this.parametros = parametros;
    }

    // ── Roles ────────────────────────────────────────────

    @GetMapping("/roles")
    public List<ObjectNode> roles() { return roles.listar(); }

    @PostMapping("/roles")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode crearRol(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Usuarios", "edit");
        return roles.crear(body, permisos.usuarioId(user));
    }

    @PutMapping("/roles/{clave}")
    public ObjectNode actualizarRol(@PathVariable String clave, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Usuarios", "edit");
        return roles.actualizar(clave, body, permisos.usuarioId(user));
    }

    @DeleteMapping("/roles/{clave}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void eliminarRol(@PathVariable String clave, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Usuarios", "edit");
        roles.eliminar(clave);
    }

    // ── Usuarios ─────────────────────────────────────────

    @GetMapping("/usuarios")
    public List<ObjectNode> usuarios() { return cuentas.listar(); }

    @PostMapping("/usuarios")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode crearUsuario(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Usuarios", "create");
        return cuentas.crear(body, user);
    }

    @PutMapping("/usuarios/{clave}")
    public ObjectNode actualizarUsuario(@PathVariable String clave, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Usuarios", "edit");
        return cuentas.actualizar(clave, body);
    }

    /** body: { password, mustChange, unlock } */
    @PostMapping("/usuarios/{clave}/clave")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cambiarClave(@PathVariable String clave, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Usuarios", "edit");
        cuentas.cambiarClave(clave, body.path("password").asText(null), body.path("mustChange").asBoolean(true), body.path("unlock").asBoolean(false));
    }

    // ── Historial de cuentas y auditoría ─────────────────

    @GetMapping("/usuario-eventos")
    public ObjectNode usuarioEventos() { return eventos.listar(); }

    /** body: { tipo: estado | clave | exportacion, datos } */
    @PostMapping("/usuario-eventos")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void registrarUsuarioEvento(@RequestBody JsonNode body) {
        eventos.registrar(body.path("tipo").asText(), body.path("datos"));
    }

    @GetMapping("/auditoria")
    public List<ObjectNode> auditoria() { return auditoria.listar(); }

    @PostMapping("/auditoria")
    public ObjectNode registrarAuditoria(@RequestBody JsonNode b, @RequestAttribute(JwtAuthFilter.USERNAME) String user, HttpServletRequest req) {
        // Solo los procesos automáticos del sistema pueden registrar a nombre de "sistema"
        String quien = "sistema".equals(b.path("user").asText()) ? "sistema" : user;
        return auditoria.registrar(new AuditoriaService.Evento(quien, b.path("module").asText(null), b.path("action").asText(null),
                b.path("detail").asText(null), b.path("object").asText(null), b.path("result").asText(null),
                b.get("changes"), b.path("reason").asText(null), b.path("device").asText(null)), permisos.usuarioId(user), req.getRemoteAddr());
    }

    // ── Empleados y nóminas ──────────────────────────────

    @GetMapping("/empleados")
    public List<ObjectNode> empleados() { return empleados.listar(); }

    @PostMapping("/empleados")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode crearEmpleado(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Nómina", "create");
        return empleados.crear(body, user);
    }

    @PutMapping("/empleados/{clave}")
    public ObjectNode actualizarEmpleado(@PathVariable String clave, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Nómina", "edit");
        return empleados.actualizar(clave, body, user);
    }

    @GetMapping("/nominas")
    public List<JsonNode> nominas() { return nominas.listar(); }

    @PutMapping("/nominas/{clave}")
    public JsonNode guardarNomina(@PathVariable String clave, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        // Los permisos dependen del cambio (crear, editar, confirmar, anular): los revisa el servicio
        return nominas.guardar(clave, body, user);
    }

    // ── Parámetros legales de nómina (Configuración › Parámetros de nómina) ──

    @GetMapping("/parametros-nomina")
    public List<ObjectNode> parametrosNomina() { return parametros.listar(); }

    @PutMapping("/parametros-nomina/{anio}")
    public void guardarParametrosNomina(@PathVariable int anio, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Configuración", "edit");
        parametros.guardar(anio, body, permisos.nombre(user));
    }

    // ── Configuración ────────────────────────────────────

    @GetMapping("/configuracion/{clave}")
    public JsonNode leerAjuste(@PathVariable String clave) {
        return config.leer(clave).orElse(null);
    }

    @PutMapping("/configuracion/{clave}")
    public JsonNode guardarAjuste(@PathVariable String clave, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        if (!AJUSTES.contains(clave)) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Ajuste no válido: " + clave);
        permisos.exigir(user, "Configuración", "edit");
        if ("nomina_tasas".equals(clave)) validarTasas(body);
        if ("hospedaje".equals(clave)) validarHospedaje(body);
        if ("politicas_reserva".equals(clave)) validarPoliticas(body);
        if ("notificaciones".equals(clave)) validarNotificaciones(body);
        if ("metas".equals(clave)) validarMetas(body);
        if ("politica_datos".equals(clave)) validarPoliticaDatos(body);
        return config.guardar(clave, body, permisos.usuarioId(user));
    }

    /** Porcentajes de ley: { employee, employer, arl, provision }, cada valor entre 0 y 30 %. */
    private static void validarTasas(JsonNode b) {
        for (String grupo : List.of("employee", "employer", "arl", "provision")) {
            JsonNode g = b.path(grupo);
            if (!g.isObject() || g.isEmpty()) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Faltan los porcentajes de " + grupo);
            g.fields().forEachRemaining(x -> {
                if (!x.getValue().isNumber() || x.getValue().asDouble() < 0 || x.getValue().asDouble() > 0.3) {
                    throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Los porcentajes deben estar entre 0 % y 30 %");
                }
            });
        }
    }

    /** Datos del hospedaje: nombre obligatorio y logo (PNG o SVG en data URL) de máximo 1 MB. */
    private static void validarHospedaje(JsonNode b) {
        if (b.path("commercialName").asText("").isBlank()) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre comercial es obligatorio");
        JsonNode logo = b.path("logo");
        if (logo.isObject()) {
            String url = logo.path("dataUrl").asText("");
            if (!url.startsWith("data:image/png;base64,") && !url.startsWith("data:image/svg+xml;base64,"))
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "El logo debe ser PNG o SVG");
            if (url.length() > 1_450_000) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "El logo pesa más de 1 MB");
        }
    }

    /** Políticas de reserva (Configuración › Alojamiento): horas, abono para confirmar, cancelación y pasadías. */
    private static void validarPoliticas(JsonNode b) {
        java.util.function.Consumer<String> no = m -> { throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, m); };
        if (!b.path("checkIn").asText("").matches("[0-9]{2}:[0-9]{2}") || !b.path("checkOut").asText("").matches("[0-9]{2}:[0-9]{2}")) no.accept("Indica las horas de check-in y check-out");
        int pct = b.path("depositPct").asInt(-1);
        if (!b.path("depositPct").isNumber() || pct < 0 || pct > 100) no.accept("El abono para confirmar debe estar entre 0 % y 100 %");
        if (b.path("freeCancelHours").asInt(-1) < 0) no.accept("Las horas de cancelación sin costo no pueden ser negativas");
        if (b.path("dayPassMax").asInt(0) < 1) no.accept("Indica el máximo de personas para pasadías");
    }

    /** Notificaciones: por alerta, en SOGO / correo y destinatarios (roles o correos), máximo 20 por alerta. */
    private static void validarNotificaciones(JsonNode b) {
        java.util.function.Consumer<String> no = m -> { throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, m); };
        if (!b.path("rules").isArray()) no.accept("Faltan las alertas");
        for (JsonNode r : b.path("rules")) {
            if (r.path("key").asText("").isBlank()) no.accept("Hay una alerta sin clave");
            if (!r.path("recipients").isArray() || r.path("recipients").size() > 20) no.accept("Los destinatarios de una alerta no son válidos");
            for (JsonNode d : r.path("recipients")) if (d.asText("").isBlank() || d.asText().length() > 120) no.accept("Hay un destinatario vacío o demasiado largo");
        }
    }

    /** Metas e indicadores: { goals: {indicador: valor}, alerts: {indicador: valor} }, valores numéricos ≥ 0. */
    private static void validarMetas(JsonNode b) {
        for (String grupo : List.of("goals", "alerts")) {
            JsonNode g = b.path(grupo);
            if (!g.isMissingNode() && !g.isObject()) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Las metas no tienen el formato esperado");
            g.fields().forEachRemaining(x -> {
                if (!x.getValue().isNumber() || x.getValue().asDouble() < 0)
                    throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "La meta o alerta de " + x.getKey() + " debe ser un número mayor o igual a 0");
            });
        }
    }

    /** Política de datos y respaldos (Configuración › Auditoría y respaldos). */
    private static void validarPoliticaDatos(JsonNode b) {
        java.util.function.Consumer<String> no = m -> { throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, m); };
        if (!List.of("Diario · 02:00", "Diario · 23:00", "Semanal · domingo 02:00", "Apagado").contains(b.path("backupSchedule").asText(""))) no.accept("Elige cuándo se hace el respaldo automático");
        int keep = b.path("backupKeep").asInt(0);
        if (keep < 1 || keep > 365) no.accept("Indica cuántos respaldos conservar (de 1 a 365)");
        if (b.path("controller").asText("").isBlank()) no.accept("Falta el responsable del tratamiento de datos");
        if (b.path("retentionYears").asInt(0) < 1) no.accept("Indica cuántos años se conserva el historial");
    }
}
