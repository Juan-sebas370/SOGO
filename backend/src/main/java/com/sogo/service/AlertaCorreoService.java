package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.dto.ReservaDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Alertas por correo (Configuración › Notificaciones, columna «Correo»). Cada 5 minutos el servidor
 * revisa en la base las alertas con correo activo y envía a sus destinatarios (roles → usuarios activos
 * con ese rol y correo; o correos sueltos) solo lo que no se ha avisado antes. Funciona aunque nadie
 * tenga SOGO abierto. Lo avisado y el historial quedan en configuracion 'alertas_correo'.
 */
@Service
public class AlertaCorreoService {

    private static final Logger log = LoggerFactory.getLogger(AlertaCorreoService.class);
    private static final String ESTADO = "alertas_correo";
    private static final DateTimeFormatter MIN = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    /** Hora de los resúmenes diarios (llegadas y salidas, ocupación, TRA pendientes). */
    public static final LocalTime HORA_RESUMEN = LocalTime.of(7, 0);
    private static final int MAX_ITEMS = 40;

    public static final Map<String, String> NOMBRES = new LinkedHashMap<>();
    private static final Map<String, String> MODULO = new HashMap<>();
    static {
        def("stock", "Stock bajo o agotado", "Inventarios › Alertas");
        def("expiry", "Producto próximo a vencer", "Inventarios › Alertas");
        def("reservations", "Nueva reserva o cancelación", "Reservas");
        def("arrivals", "Llegadas y salidas del día", "Alojamiento");
        def("tra", "TRA pendiente de envío", "TRA");
        def("invoice-rejected", "Factura rechazada por la DIAN", "Facturación");
        def("invoice-range", "Rango de facturación al 80 %", "Facturación › Configuración");
        def("payroll", "Nómina lista para aprobar", "Nómina");
        def("accounts", "Cuenta bloqueada o IP nueva", "Usuarios");
        def("report-failed", "Reporte programado fallido", "Reportes › Programados");
        def("backup-failed", "Respaldo fallido", "Configuración › Auditoría y respaldos");
        def("daily-occupancy", "Resumen diario de ocupación", "Reportes");
    }
    private static void def(String k, String n, String m) { NOMBRES.put(k, n); MODULO.put(k, m); }

    record Item(String key, String text) {}

    private final JdbcTemplate jdbc;
    private final ConfiguracionService config;
    private final CorreoService correo;
    private final ReservaService reservas;
    private final ObjectMapper json;

    public AlertaCorreoService(JdbcTemplate jdbc, ConfiguracionService config, CorreoService correo, ReservaService reservas, ObjectMapper json) {
        this.jdbc = jdbc;
        this.config = config;
        this.correo = correo;
        this.reservas = reservas;
        this.json = json;
    }

    @Scheduled(cron = "0 */5 * * * *")
    public void automatico() {
        try { revisar(LocalDateTime.now()); } catch (Exception e) { log.error("No se pudieron revisar las alertas por correo: {}", e.getMessage()); }
    }

    /** Historial de avisos enviados (para Configuración › Notificaciones). */
    public JsonNode historial() {
        ObjectNode e = estado();
        ObjectNode out = json.createObjectNode();
        out.set("log", e.path("log"));
        out.put("dailyAt", HORA_RESUMEN.toString());
        out.put("mailReady", correo.configurado());
        return out;
    }

    /** Revisa todas las alertas con correo activo y envía lo nuevo. Devuelve cuántos correos de alerta salieron. */
    public synchronized int revisar(LocalDateTime ahora) {
        JsonNode reglas = config.leer("notificaciones").map(v -> v.path("rules")).orElse(null);
        ObjectNode est = estado();
        // Eventos (reservas, cuentas, reportes y respaldos fallidos): solo cuenta lo ocurrido después de activar el correo
        ObjectNode sent = obj(est, "sent"), since = obj(est, "since");
        if (reglas == null || !reglas.isArray()) return 0;
        String now = ahora.format(MIN);
        int enviados = 0;
        List<ReservaDto> rs = null;
        for (JsonNode r : reglas) {
            String key = r.path("key").asText();
            if (!NOMBRES.containsKey(key)) continue;
            if (!r.path("email").asBoolean(false)) { since.remove(key); continue; }
            if (!since.has(key)) since.put(key, now);
            List<String> para = destinatarios(r.path("recipients"));
            if (para.isEmpty() || !correo.configurado()) continue;
            if (rs == null && Set.of("reservations", "arrivals", "tra", "daily-occupancy").contains(key)) rs = reservas.listar();
            List<Item> items;
            try { items = detectar(key, ahora, since.path(key).asText(now), rs); }
            catch (Exception e) { log.warn("Alerta «{}»: {}", key, e.getMessage()); continue; }
            List<Item> nuevos = items.stream().filter(i -> !sent.has(i.key())).toList();
            if (nuevos.isEmpty()) continue;
            List<String> ok = new ArrayList<>(), fallos = new ArrayList<>();
            String asunto = "SOGO · " + NOMBRES.get(key) + (nuevos.size() > 1 ? " (" + nuevos.size() + ")" : "");
            String html = html(key, nuevos), texto = texto(key, nuevos);
            for (String d : para) {
                if (correo.enviarHtml(d, asunto, texto, html)) ok.add(d); else fallos.add(d + ": " + correo.ultimoError());
            }
            // Se marca como avisado aunque algún destinatario falle (el error queda en el historial; no se reenvía cada 5 minutos)
            nuevos.forEach(i -> sent.put(i.key(), now));
            registrar(est, now, key, nuevos, ok, fallos);
            enviados++;
        }
        // Lo avisado hace más de 90 días se olvida (si la situación sigue, vuelve a avisarse)
        String limite = ahora.minusDays(90).format(MIN);
        List<String> viejos = new ArrayList<>();
        sent.fieldNames().forEachRemaining(k -> { if (sent.path(k).asText().compareTo(limite) < 0) viejos.add(k); });
        viejos.forEach(sent::remove);
        config.guardar(ESTADO, est, null);
        return enviados;
    }

    // ── Qué hay para avisar en cada alerta ─────────────

    List<Item> detectar(String key, LocalDateTime ahora, String desde, List<ReservaDto> rs) {
        LocalDate hoy = ahora.toLocalDate();
        String dia = hoy.toString();
        boolean resumen = !ahora.toLocalTime().isBefore(HORA_RESUMEN);
        List<Item> out = new ArrayList<>();
        switch (key) {
            case "stock", "expiry" -> {
                String tipos = key.equals("stock") ? "'Agotado','Stock bajo'" : "'Por vencer'";
                jdbc.query("SELECT a.id, a.tipo, p.nombre, p.existencias, p.unidad, p.stock_minimo, p.fecha_vencimiento FROM alertas_inventario a "
                        + "JOIN productos_inventario p ON p.id = a.producto_id WHERE a.estado = 'Activa' AND a.tipo IN (" + tipos + ") ORDER BY a.id", rs2 -> {
                    String t = rs2.getString("tipo");
                    String det = t.equals("Por vencer") ? "vence el " + fecha(rs2.getString("fecha_vencimiento"))
                            : num(rs2.getBigDecimal("existencias")) + " " + rs2.getString("unidad") + " (mínimo " + num(rs2.getBigDecimal("stock_minimo")) + ")";
                    out.add(new Item("inv-" + rs2.getLong("id"), t + ": " + rs2.getString("nombre") + " · " + det));
                });
            }
            case "reservations" -> rs.forEach(r -> {
                if (r.createdAt() != null && r.createdAt().compareTo(desde) >= 0 && !"Cancelada".equals(r.status()))
                    out.add(new Item("res-new-" + r.id(), "Nueva reserva " + r.code() + " · " + r.guestName() + " · " + fecha(r.checkIn()) + " a " + fecha(r.checkOut()) + " · " + r.channel()));
                if ("Cancelada".equals(r.status()) && r.updatedAt() != null && r.updatedAt().compareTo(desde) >= 0)
                    out.add(new Item("res-cancel-" + r.id(), "Cancelada " + r.code() + " · " + r.guestName() + " · " + fecha(r.checkIn())
                            + (r.cancelReason() != null && !r.cancelReason().isBlank() ? " · motivo: " + r.cancelReason() : "")));
            });
            case "arrivals" -> {
                if (!resumen) break;
                List<String> l = new ArrayList<>(), s = new ArrayList<>();
                rs.forEach(r -> {
                    if (dia.equals(r.checkIn()) && Set.of("Pendiente", "Confirmada").contains(r.status())) l.add(r.code() + " · " + r.guestName() + " · " + habitaciones(r));
                    if (dia.equals(r.checkOut()) && r.checkedInAt() != null && (r.checkedOutAt() == null || r.checkedOutAt().isBlank()) && !"Cancelada".equals(r.status()))
                        s.add(r.code() + " · " + r.guestName() + " · " + habitaciones(r));
                });
                if (!l.isEmpty() || !s.isEmpty()) out.add(new Item("arrivals-" + dia, "Hoy " + fecha(dia) + ": " + l.size() + " llegada(s) y " + s.size() + " salida(s)."
                        + (l.isEmpty() ? "" : "\nLlegadas: " + String.join("; ", l)) + (s.isEmpty() ? "" : "\nSalidas: " + String.join("; ", s))));
            }
            case "tra" -> {
                if (!resumen) break;
                Map<String, String> estados = new HashMap<>();
                jdbc.query("SELECT reserva_id, estado FROM tra_registros", rs2 -> { estados.put(String.valueOf(rs2.getLong(1)), rs2.getString(2)); });
                String mes = hoy.minusDays(30).toString();
                List<String> p = new ArrayList<>();
                rs.forEach(r -> {
                    boolean estadia = r.checkIn() != null && r.checkIn().compareTo(dia) <= 0 && r.checkIn().compareTo(mes) >= 0 && r.nights() > 0
                            && Set.of("Confirmada", "Finalizada").contains(r.status()) && r.checkedInAt() != null;
                    if (estadia && !"REPORTADA".equals(estados.get(r.id())))
                        p.add(r.code() + " · " + r.guestName() + " · llegó el " + fecha(r.checkIn()) + " · " + estadoTra(estados.get(r.id())));
                });
                if (!p.isEmpty()) out.add(new Item("tra-" + dia, p.size() + " TRA sin reportar al MinCIT:\n" + String.join("\n", p)));
            }
            case "invoice-rejected" -> jdbc.query("SELECT id, numero, comprador, motivo_rechazo FROM facturas WHERE estado_dian = 'Rechazada' AND nota_credito IS NULL", rs2 -> {
                String comprador = texto(rs2.getString("comprador"), "name");
                out.add(new Item("fac-rej-" + rs2.getLong("id") + "-" + Objects.hashCode(rs2.getString("motivo_rechazo")),
                        "Factura " + Objects.toString(rs2.getString("numero"), "sin número") + (comprador.isEmpty() ? "" : " · " + comprador)
                                + " · " + Objects.toString(rs2.getString("motivo_rechazo"), "sin motivo registrado")));
            });
            case "invoice-range" -> {
                JsonNode r = config.leer(FacturacionService.CONFIG).map(v -> v.path("resolution")).orElse(null);
                if (r == null || r.path("prefix").asText("").isBlank() || r.path("to").asLong(0) <= 0) break;
                String pre = r.path("prefix").asText();
                long desdeN = r.path("from").asLong(1), hasta = r.path("to").asLong();
                List<Long> c = jdbc.queryForList("SELECT ultimo FROM consecutivos WHERE prefijo = ? AND anio = 0", Long.class, "F:" + pre);
                Long max = jdbc.queryForObject("SELECT MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) FROM facturas WHERE numero LIKE ?", Long.class, pre + "-%");
                long ultimo = Math.max(c.isEmpty() ? 0 : c.get(0), max == null ? 0 : max);
                long total = hasta - desdeN + 1, usados = Math.max(0, ultimo - desdeN + 1);
                if (total > 0 && usados * 100 >= total * 80)
                    out.add(new Item("range-" + pre + "-" + hasta, "Van " + usados + " de " + total + " números de la resolución " + r.path("number").asText("")
                            + " (" + pre + "-" + desdeN + " a " + pre + "-" + hasta + "). Quedan " + (total - usados) + ": solicita a la DIAN una nueva numeración."));
            }
            case "payroll" -> jdbc.query("SELECT id, periodo, fecha_pago, num_empleados, total_neto FROM nominas WHERE estado = 'Borrador' AND fecha_pago <= ?", rs2 -> {
                out.add(new Item("nom-" + rs2.getLong("id"), "Nómina " + rs2.getString("periodo") + " en borrador · se paga el " + fecha(rs2.getString("fecha_pago"))
                        + " · " + rs2.getInt("num_empleados") + " empleado(s) · neto $ " + num(rs2.getBigDecimal("total_neto"))));
            }, hoy.plusDays(3));
            case "accounts" -> {
                jdbc.query("SELECT id, fecha, username, detalle FROM auditoria WHERE fecha >= ? AND accion LIKE '%cuenta bloqueada%' ORDER BY id", rs2 -> {
                    out.add(new Item("acc-blk-" + rs2.getLong("id"), "Cuenta bloqueada: " + rs2.getString("username") + " · " + rs2.getString("fecha").substring(0, 16)));
                }, desde.replace('T', ' '));
                // Inicio de sesión desde una IP que ese usuario no había usado antes
                jdbc.query("SELECT a.id, a.fecha, a.username, a.ip FROM auditoria a WHERE a.fecha >= ? AND a.accion = 'Inició sesión' AND a.resultado = 'Exitoso' "
                        + "AND a.ip IS NOT NULL AND a.ip <> '' AND a.usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auditoria b WHERE b.usuario_id = a.usuario_id "
                        + "AND b.accion = 'Inició sesión' AND b.resultado = 'Exitoso' AND b.ip = a.ip AND b.id < a.id) "
                        + "AND EXISTS (SELECT 1 FROM auditoria c WHERE c.usuario_id = a.usuario_id AND c.accion = 'Inició sesión' AND c.resultado = 'Exitoso' AND c.id < a.id) ORDER BY a.id", rs2 -> {
                    out.add(new Item("acc-ip-" + rs2.getLong("id"), "Inicio de sesión de " + rs2.getString("username") + " desde una IP nueva (" + rs2.getString("ip") + ") · "
                            + rs2.getString("fecha").substring(0, 16)));
                }, desde.replace('T', ' '));
            }
            case "report-failed" -> {
                JsonNode ex = config.leer("reportes_envios").map(v -> v.path("executions")).orElse(json.createArrayNode());
                Set<String> reintentadas = new HashSet<>();
                ex.forEach(e -> { if (!e.path("retryOf").asText("").isEmpty() && ok(e)) reintentadas.add(e.path("retryOf").asText()); });
                ex.forEach(e -> {
                    if (e.path("test").asBoolean(false) || ok(e) || reintentadas.contains(e.path("id").asText()) || e.path("at").asText().compareTo(desde) < 0) return;
                    List<String> f = new ArrayList<>();
                    e.path("deliveries").forEach(d -> { if (!d.path("ok").asBoolean()) f.add(d.path("email").asText() + " (" + d.path("reason").asText() + ")"); });
                    out.add(new Item("rep-" + e.path("id").asText(), "«" + e.path("name").asText() + "» del " + e.path("at").asText().replace('T', ' ') + " no llegó a " + String.join(", ", f)));
                });
            }
            case "backup-failed" -> {
                JsonNode b = config.leer("respaldos_estado").orElse(null);
                if (b != null && !b.path("ok").asBoolean(true) && b.path("at").asText("").compareTo(desde) >= 0)
                    out.add(new Item("bkp-" + b.path("at").asText(), "Respaldo " + b.path("kind").asText("").toLowerCase() + " del " + b.path("at").asText().replace('T', ' ')
                            + " falló: " + b.path("detail").asText("")));
            }
            case "daily-occupancy" -> {
                if (!resumen) break;
                Integer total = jdbc.queryForObject("SELECT COUNT(*) FROM habitaciones", Integer.class);
                Set<String> ocupadas = new TreeSet<>();
                int[] llegan = {0}, salen = {0}, huespedes = {0};
                rs.forEach(r -> {
                    if (Set.of("Cancelada", "No presentada").contains(r.status()) || r.checkIn() == null || r.checkOut() == null) return;
                    if (r.checkIn().compareTo(dia) <= 0 && r.checkOut().compareTo(dia) > 0) { ocupadas.addAll(r.rooms()); huespedes[0] += r.adults() + r.children() + r.infants(); }
                    if (dia.equals(r.checkIn())) llegan[0]++;
                    if (dia.equals(r.checkOut())) salen[0]++;
                });
                int t = total == null ? 0 : total;
                out.add(new Item("occ-" + dia, "Esta noche (" + fecha(dia) + "): " + ocupadas.size() + " de " + t + " habitaciones ocupadas"
                        + (t > 0 ? " (" + Math.round(ocupadas.size() * 100.0 / t) + " %)" : "") + " · " + huespedes[0] + " huésped(es) · "
                        + llegan[0] + " llegada(s) y " + salen[0] + " salida(s) hoy."));
            }
            default -> { }
        }
        return out.size() > MAX_ITEMS ? new ArrayList<>(out.subList(0, MAX_ITEMS)) : out;
    }

    // ── Destinatarios ──────────────────────────────────

    /** Correos de una lista de destinatarios: un rol llega a sus usuarios activos con correo. */
    public List<String> destinatarios(JsonNode lista) {
        Set<String> out = new LinkedHashSet<>();
        for (JsonNode d : lista) {
            String v = d.asText("").trim();
            if (v.isEmpty()) continue;
            if (v.contains("@")) { out.add(v.toLowerCase(Locale.ROOT)); continue; }
            String activos = "u.email IS NOT NULL AND u.email <> '' AND COALESCE(u.estado, 'Activo') IN ('Activo', 'Pendiente') AND COALESCE(u.activo, 1) = 1";
            out.addAll(jdbc.queryForList("SELECT DISTINCT LOWER(u.email) FROM usuarios u JOIN usuario_roles ur ON ur.usuario_id = u.id JOIN roles r ON r.id = ur.rol_id "
                    + "WHERE r.nombre = ? AND " + activos, String.class, v));
            // Las cuentas ADMIN de la página web sin roles de SOGO cuentan como Administrador
            if (v.equals("Administrador")) out.addAll(jdbc.queryForList("SELECT LOWER(u.email) FROM usuarios u WHERE u.rol = 'ADMIN' AND " + activos
                    + " AND NOT EXISTS (SELECT 1 FROM usuario_roles ur WHERE ur.usuario_id = u.id)", String.class));
        }
        return new ArrayList<>(out);
    }

    // ── Correo ─────────────────────────────────────────

    private String html(String key, List<Item> items) {
        String hotel = config.leer("hospedaje").map(h -> h.path("commercialName").asText("")).orElse("");
        StringBuilder li = new StringBuilder();
        items.forEach(i -> li.append("<li style=\"margin:0 0 6px\">").append(esc(i.text()).replace("\n", "<br>")).append("</li>"));
        return "<div style=\"font-family:Arial,sans-serif;color:#1F2937;max-width:640px\">"
                + (hotel.isBlank() ? "" : "<div style=\"font-weight:700;color:#0A2540;border-bottom:2px solid #0B4A8B;padding-bottom:8px;margin-bottom:14px\">" + esc(hotel) + "</div>")
                + "<h2 style=\"font-size:17px;color:#0A2540;margin:0 0 10px\">" + esc(NOMBRES.get(key)) + "</h2>"
                + "<ul style=\"padding-left:18px;font-size:13.5px\">" + li + "</ul>"
                + "<p style=\"font-size:13px\">Revísalo en SOGO › " + esc(MODULO.get(key)) + ".</p>"
                + "<p style=\"font-size:11.5px;color:#9CA3AF;border-top:1px solid #EEF1F5;padding-top:8px\">Alerta automática de SOGO. Para dejar de recibirla, ajústala en Configuración › Notificaciones.</p></div>";
    }

    private static String texto(String key, List<Item> items) {
        StringBuilder s = new StringBuilder(NOMBRES.get(key)).append("\n\n");
        items.forEach(i -> s.append("- ").append(i.text()).append("\n"));
        return s.append("\nRevísalo en SOGO › ").append(MODULO.get(key)).append(".").toString();
    }

    private void registrar(ObjectNode est, String at, String key, List<Item> items, List<String> ok, List<String> fallos) {
        ArrayNode l = est.path("log") instanceof ArrayNode a ? a : est.putArray("log");
        ObjectNode e = json.createObjectNode();
        e.put("at", at);
        e.put("key", key);
        e.put("label", NOMBRES.get(key));
        e.put("count", items.size());
        e.put("summary", items.get(0).text().split("\n")[0] + (items.size() > 1 ? " y " + (items.size() - 1) + " más" : ""));
        ArrayNode okA = e.putArray("sentTo"); ok.forEach(okA::add);
        ArrayNode fA = e.putArray("failed"); fallos.forEach(fA::add);
        l.insert(0, e);
        while (l.size() > 100) l.remove(l.size() - 1);
    }

    private static ObjectNode obj(ObjectNode o, String k) {
        return o.path(k) instanceof ObjectNode x ? x : o.putObject(k);
    }

    private ObjectNode estado() {
        JsonNode v = config.leer(ESTADO).orElse(null);
        return v instanceof ObjectNode o ? o.deepCopy() : json.createObjectNode();
    }

    // ── Utilidades ─────────────────────────────────────

    private static boolean ok(JsonNode e) {
        for (JsonNode d : e.path("deliveries")) if (!d.path("ok").asBoolean()) return false;
        return true;
    }

    private static String habitaciones(ReservaDto r) {
        return r.rooms() == null || r.rooms().isEmpty() ? r.lodgingType() : "hab. " + String.join(", ", r.rooms());
    }

    private static String estadoTra(String e) {
        if (e == null) return "sin registrar";
        return switch (e) { case "ERROR" -> "con error"; case "REQUIERE_CORRECCION" -> "por corregir"; case "LISTA_PARA_ENVIO" -> "lista para enviar"; default -> "en borrador"; };
    }

    private String texto(String jsonText, String campo) {
        try { return jsonText == null ? "" : json.readTree(jsonText).path(campo).asText(""); } catch (Exception e) { return ""; }
    }

    private static String fecha(String iso) {
        try { return LocalDate.parse(iso.substring(0, 10)).format(DMY); } catch (Exception e) { return Objects.toString(iso, ""); }
    }

    private static String num(java.math.BigDecimal v) {
        if (v == null) return "0";
        java.text.NumberFormat f = java.text.NumberFormat.getNumberInstance(Locale.forLanguageTag("es-CO"));
        f.setMaximumFractionDigits(2);
        return f.format(v);
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
