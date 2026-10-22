package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.ConfiguracionService;
import com.sogo.service.CorreoService;
import com.sogo.service.PermisoService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;

import static org.springframework.http.HttpStatus.*;

/**
 * Envíos de los reportes programados (Reportes › Programados), con su historial en
 * configuracion 'reportes_envios'. El navegador arma el reporte con los mismos datos de la pantalla
 * y el servidor lo envía por correo a cada destinatario y registra el resultado real.
 * Una programación se envía una sola vez por fecha y hora («slot»), aunque SOGO esté abierto en varios equipos.
 */
@RestController
@RequestMapping("/api/reportes/envios")
public class ReportesEnviosController {

    private static final String CLAVE = "reportes_envios";
    private static final int HISTORIAL = 300;
    private static final int MAX_ADJUNTO = 8 * 1024 * 1024;
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");
    private static final Pattern SLOT = Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}");
    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    private final ConfiguracionService config;
    private final PermisoService permisos;
    private final CorreoService correo;
    private final ObjectMapper json;

    public ReportesEnviosController(ConfiguracionService config, PermisoService permisos, CorreoService correo, ObjectMapper json) {
        this.config = config;
        this.permisos = permisos;
        this.correo = correo;
        this.json = json;
    }

    @GetMapping
    public JsonNode listar(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Reportes", "view");
        return historial();
    }

    @PostMapping
    public synchronized JsonNode enviar(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Reportes", "create");
        if (!correo.configurado()) throw new ResponseStatusException(SERVICE_UNAVAILABLE, "No se pudo enviar: " + correo.faltante());

        boolean prueba = body.path("test").asBoolean(false);
        String scheduleId = body.path("scheduleId").asText("");
        String slot = body.path("slot").asText("");
        String retryOf = body.path("retryOf").asText("");
        String asunto = body.path("subject").asText("").trim();
        String html = body.path("html").asText("");
        String texto = body.path("text").asText("");
        if (asunto.isEmpty() || asunto.length() > 160) throw new ResponseStatusException(BAD_REQUEST, "El asunto debe tener entre 1 y 160 caracteres");
        if (html.isBlank() || html.length() > 4_000_000) throw new ResponseStatusException(BAD_REQUEST, "El contenido del reporte está vacío o es demasiado grande");

        List<String> para = new ArrayList<>();
        for (JsonNode d : body.path("recipients")) {
            String e = d.asText("").trim().toLowerCase(Locale.ROOT);
            if (!EMAIL.matcher(e).matches()) throw new ResponseStatusException(BAD_REQUEST, "«" + e + "» no es un correo válido");
            if (!para.contains(e)) para.add(e);
        }
        if (para.isEmpty() || para.size() > 20) throw new ResponseStatusException(BAD_REQUEST, "Indica entre 1 y 20 destinatarios");

        ArrayNode lista = historial();
        JsonNode programacion = null;
        if (!prueba) {
            programacion = programacion(scheduleId);
            if (programacion == null) throw new ResponseStatusException(NOT_FOUND, "La programación ya no existe");
            if (!retryOf.isEmpty()) {
                if (buscar(lista, retryOf) == null) throw new ResponseStatusException(NOT_FOUND, "No se encontró el envío a reintentar");
            } else {
                if (!programacion.path("active").asBoolean(true)) throw new ResponseStatusException(CONFLICT, "La programación está pausada");
                if (!SLOT.matcher(slot).matches()) throw new ResponseStatusException(BAD_REQUEST, "Falta la fecha y hora programada del envío");
                for (JsonNode e : lista) {
                    if (scheduleId.equals(e.path("scheduleId").asText()) && slot.equals(e.path("slot").asText()) && e.path("retryOf").asText("").isEmpty() && !e.path("test").asBoolean(false)) {
                        throw new ResponseStatusException(CONFLICT, "Este envío ya se hizo");
                    }
                }
            }
            // Solo a destinatarios de la programación (no se usa como relevo de correo)
            Set<String> permitidos = new HashSet<>();
            programacion.path("recipients").forEach(d -> permitidos.add(d.asText("").trim().toLowerCase(Locale.ROOT)));
            for (String e : para) {
                if (!permitidos.contains(e)) throw new ResponseStatusException(BAD_REQUEST, "«" + e + "» no está entre los destinatarios de la programación");
            }
        }

        String archivo = null, tipo = null;
        byte[] datos = null;
        JsonNode adj = body.path("attachment");
        if (adj.isObject()) {
            archivo = adj.path("name").asText("").replaceAll("[\\\\/:*?\"<>|]", "-").trim();
            tipo = adj.path("type").asText("application/octet-stream");
            try { datos = Base64.getDecoder().decode(adj.path("base64").asText("")); }
            catch (IllegalArgumentException e) { throw new ResponseStatusException(BAD_REQUEST, "El archivo adjunto no es válido"); }
            if (archivo.isEmpty() || datos.length == 0) throw new ResponseStatusException(BAD_REQUEST, "El archivo adjunto está vacío");
            if (datos.length > MAX_ADJUNTO) throw new ResponseStatusException(BAD_REQUEST, "El archivo adjunto supera 8 MB");
        }

        ArrayNode entregas = json.createArrayNode();
        boolean falla = false;
        for (String e : para) {
            boolean ok = correo.enviarConAdjunto(e, asunto, texto, html, archivo, tipo, datos);
            ObjectNode d = entregas.addObject();
            d.put("email", e);
            d.put("ok", ok);
            if (!ok) { d.put("reason", correo.ultimoError()); falla = true; }
        }

        String ahora = LocalDateTime.now().format(MINUTO);
        ObjectNode ej = json.createObjectNode();
        ej.put("id", "ex" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        ej.put("scheduleId", prueba ? "" : scheduleId);
        ej.put("name", body.path("name").asText(asunto));
        ej.put("report", body.path("report").asText(""));
        ej.put("at", ahora);
        if (!prueba && retryOf.isEmpty()) ej.put("slot", slot);
        ej.put("period", body.path("period").asText(""));
        ej.put("format", body.path("format").asText(""));
        ej.set("deliveries", entregas);
        ej.put("pages", 0);
        if (prueba) ej.put("test", true);
        if (!retryOf.isEmpty()) ej.put("retryOf", retryOf);
        if (body.path("note").isTextual() && !body.path("note").asText().isBlank()) ej.put("note", body.path("note").asText());
        ej.put("by", permisos.nombre(user));
        lista.insert(0, ej);
        while (lista.size() > HISTORIAL) lista.remove(lista.size() - 1);
        ObjectNode v = json.createObjectNode();
        v.set("executions", lista);
        config.guardar(CLAVE, v, permisos.usuarioId(user));

        if (falla && programacion != null && programacion.path("notifyOnFail").asBoolean(false)) avisarFalla(programacion, ej);
        return ej;
    }

    /** «Avisarme si un envío falla»: correo a quien creó la programación (si no es uno de los que fallaron). */
    private void avisarFalla(JsonNode programacion, JsonNode ej) {
        String duenio = programacion.path("ownerLogin").asText("");
        String email = permisos.usuario(duenio).map(u -> u.getEmail()).orElse("");
        if (email == null || email.isBlank()) return;
        StringBuilder fallos = new StringBuilder();
        for (JsonNode d : ej.path("deliveries")) {
            if (d.path("ok").asBoolean()) continue;
            if (d.path("email").asText().equalsIgnoreCase(email)) return;
            fallos.append("<li>").append(esc(d.path("email").asText())).append(": ").append(esc(d.path("reason").asText())).append("</li>");
        }
        String nombre = esc(ej.path("name").asText());
        correo.enviarHtml(email, "SOGO · Falló el envío de «" + ej.path("name").asText() + "»",
                "No se pudo entregar el reporte programado «" + ej.path("name").asText() + "». Revisa Reportes › Programados.",
                "<p>No se pudo entregar el reporte programado <strong>" + nombre + "</strong> (" + esc(ej.path("at").asText().replace('T', ' ')) + "):</p><ul>"
                        + fallos + "</ul><p>Revisa los destinatarios en SOGO › Reportes › Programados y usa «Reintentar envío».</p>");
    }

    private JsonNode programacion(String id) {
        JsonNode v = config.leer("reportes_programados").orElse(null);
        if (v == null || id.isEmpty()) return null;
        for (JsonNode s : v.path("schedules")) if (id.equals(s.path("id").asText())) return s;
        return null;
    }

    private static JsonNode buscar(ArrayNode lista, String id) {
        for (JsonNode e : lista) if (id.equals(e.path("id").asText())) return e;
        return null;
    }

    private ArrayNode historial() {
        JsonNode v = config.leer(CLAVE).orElse(null);
        return v != null && v.path("executions").isArray() ? (ArrayNode) v.path("executions").deepCopy() : json.createArrayNode();
    }

    private static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
