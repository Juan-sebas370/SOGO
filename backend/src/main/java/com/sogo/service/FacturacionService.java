package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;

import static org.springframework.http.HttpStatus.*;

/**
 * Facturación electrónica (tablas `facturas`, `factura_lineas`, `factura_eventos`, `terceros`).
 *
 *  · Borrador: se guarda y se edita libremente; no tiene número.
 *  · Emitir: el servidor valida resolución, rango y datos, toma el siguiente número de la
 *    resolución (`consecutivos`) y la deja "En validación" ante la DIAN.
 *  · Respuesta de la DIAN: aceptada (con su CUFE de 96 caracteres) o rechazada (con el motivo).
 *    Una rechazada se corrige y se reenvía con el mismo número.
 *  · Anular: con nota crédito numerada por el servidor; libera los consumos facturados.
 *
 * Configuración (configuracion 'facturacion'): resolución, proveedor, tarifas y correo. La clave
 * de API nunca sale del servidor: se devuelve vacía con `apiKeySet`.
 */
@Service
public class FacturacionService {

    public static final String CONFIG = "facturacion";
    private static final Pattern CUFE = Pattern.compile("^[0-9a-fA-F]{96}$");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");
    private static final List<String> CATEGORIAS = List.of("Alojamiento", "Daños y faltantes", "Lavandería", "Eventos y pasadías", "Otro", "Restaurante", "Minibar");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final JdbcTemplate jdbc;
    private final ConfiguracionService config;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    private final CorreoService correo;

    public FacturacionService(JdbcTemplate jdbc, ConfiguracionService config, ObjectMapper json, PlatformTransactionManager txManager, CorreoService correo) {
        this.jdbc = jdbc;
        this.correo = correo;
        this.config = config;
        this.json = json;
        this.tx = new TransactionTemplate(txManager);
    }

    // ── Configuración ────────────────────────────────────

    private ObjectNode configCompleta() {
        JsonNode v = config.leer(CONFIG).orElse(null);
        return v instanceof ObjectNode o ? o.deepCopy() : json.createObjectNode();
    }

    /** Configuración para la pantalla: sin la clave de API. */
    public ObjectNode configPublica() {
        ObjectNode c = configCompleta();
        ObjectNode p = c.withObject("/provider");
        p.put("apiKeySet", !p.path("apiKey").asText("").isBlank());
        p.put("apiKey", "");
        return c;
    }

    /** Guarda la configuración. Una clave de API vacía conserva la que ya estaba guardada. */
    public ObjectNode guardarConfig(JsonNode body, Long uid) {
        if (!(body instanceof ObjectNode nuevo)) throw new ResponseStatusException(BAD_REQUEST, "Configuración no válida");
        ObjectNode actual = configCompleta();
        ObjectNode c = nuevo.deepCopy();
        ObjectNode p = c.withObject("/provider");
        if (p.path("apiKey").asText("").isBlank()) p.put("apiKey", actual.path("provider").path("apiKey").asText(""));
        p.remove("apiKeySet");

        JsonNode r = c.path("resolution");
        List<String> e = new ArrayList<>();
        String prefijo = r.path("prefix").asText("").trim();
        if (!prefijo.matches("[A-Z0-9]{1,4}")) e.add("el prefijo de facturas debe tener de 1 a 4 letras o números en mayúscula");
        if (!r.path("creditPrefix").asText("").trim().matches("[A-Z0-9]{1,4}")) e.add("el prefijo de notas crédito debe tener de 1 a 4 letras o números en mayúscula");
        long desde = r.path("from").asLong(0), hasta = r.path("to").asLong(0);
        if (desde < 1 || hasta <= desde) e.add("el rango autorizado debe ir de un número menor a uno mayor");
        String vd = r.path("validFrom").asText(""), vh = r.path("validTo").asText("");
        if (!vd.isEmpty() && !vh.isEmpty() && vh.compareTo(vd) < 0) e.add("la vigencia debe terminar después de empezar");
        String prefijoAnterior = actual.path("resolution").path("prefix").asText("");
        long usado = ultimoNumero(prefijo);
        if (!prefijoAnterior.isEmpty() && !prefijoAnterior.equals(prefijo) && ultimoNumero(prefijoAnterior) > 0) e.add("el prefijo no puede cambiar: ya hay facturas emitidas con " + prefijoAnterior);
        if (usado > 0 && hasta < usado) e.add("el rango no puede terminar antes de la última factura emitida (" + prefijo + "-" + usado + ")");
        for (JsonNode t : c.path("taxes")) {
            double tasa = t.path("rate").asDouble(-1);
            if (tasa < 0 || tasa > 0.5) e.add("las tarifas de impuesto deben estar entre 0 % y 50 %");
        }
        if (!e.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "No se puede guardar: " + String.join(", ", new LinkedHashSet<>(e)));
        config.guardar(CONFIG, c, uid);
        return configPublica();
    }

    /**
     * Prueba de conexión: el servidor llama a la URL del proveedor con sus credenciales y
     * guarda la respuesta. No inventa resultados: si no hay URL o no responde, lo dice.
     */
    public ObjectNode probarConexion(Long uid) {
        ObjectNode c = configCompleta();
        ObjectNode p = c.withObject("/provider");
        String url = p.path("apiUrl").asText("").trim();
        boolean ok;
        String mensaje;
        if (url.isEmpty() || p.path("clientId").asText("").isBlank() || p.path("apiKey").asText("").isBlank()) {
            ok = false;
            mensaje = "Faltan la URL, el usuario o la clave de API del proveedor";
        } else {
            try {
                HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
                HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
                        .header("Authorization", "Bearer " + p.path("apiKey").asText(""))
                        .header("X-Client-Id", p.path("clientId").asText("")).GET().build();
                int status = http.send(req, HttpResponse.BodyHandlers.discarding()).statusCode();
                ok = status < 400;
                mensaje = ok ? "El proveedor respondió (HTTP " + status + ")"
                        : status == 401 || status == 403 ? "El proveedor rechazó las credenciales (HTTP " + status + ")" : "El proveedor respondió con error HTTP " + status;
            } catch (IllegalArgumentException ex) {
                ok = false; mensaje = "La URL del proveedor no es válida";
            } catch (Exception ex) {
                ok = false; mensaje = "No se pudo conectar con el proveedor: " + (ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage());
            }
        }
        p.put("connected", ok);
        p.put("lastResponse", LocalDateTime.now().withNano(0).format(ISO) + " · " + corto(mensaje, 200));
        config.guardar(CONFIG, c, uid);
        ObjectNode r = json.createObjectNode();
        r.put("ok", ok);
        r.put("message", mensaje);
        r.set("config", configPublica());
        return r;
    }

    // ── Consulta ─────────────────────────────────────────

    public List<ObjectNode> listar() {
        Map<Long, ArrayNode> lineas = new HashMap<>();
        jdbc.query("SELECT * FROM factura_lineas ORDER BY factura_id, orden, id", rs -> {
            ObjectNode l = json.createObjectNode();
            l.put("id", rs.getLong("consumo_id") > 0 ? "c-" + rs.getLong("consumo_id") : "l-" + rs.getLong("id"));
            l.put("category", rs.getString("categoria"));
            l.put("description", rs.getString("descripcion"));
            l.put("detail", Objects.toString(rs.getString("detalle"), ""));
            l.put("dateLabel", Objects.toString(rs.getString("periodo"), ""));
            l.put("quantity", rs.getBigDecimal("cantidad").stripTrailingZeros().doubleValue());
            l.put("unitLabel", Objects.toString(rs.getString("unidad"), ""));
            l.put("unitValue", rs.getBigDecimal("valor_unitario").doubleValue());
            l.put("discountPct", rs.getBigDecimal("descuento_pct").doubleValue());
            l.put("discountLabel", Objects.toString(rs.getString("descuento_motivo"), ""));
            l.put("taxKind", rs.getString("tipo_impuesto"));
            l.put("taxRate", rs.getBigDecimal("tarifa_impuesto").doubleValue());
            l.put("included", rs.getBoolean("incluida"));
            long consumo = rs.getLong("consumo_id");
            if (!rs.wasNull()) l.put("chargeId", String.valueOf(consumo));
            lineas.computeIfAbsent(rs.getLong("factura_id"), k -> json.createArrayNode()).add(l);
        });
        Map<Long, ArrayNode> eventos = new HashMap<>();
        jdbc.query("SELECT * FROM factura_eventos ORDER BY factura_id, fecha, id", rs -> {
            ObjectNode e = json.createObjectNode();
            e.put("at", rs.getTimestamp("fecha").toLocalDateTime().format(ISO));
            e.put("label", rs.getString("titulo"));
            e.put("detail", Objects.toString(rs.getString("detalle"), ""));
            e.put("tone", rs.getString("tono"));
            eventos.computeIfAbsent(rs.getLong("factura_id"), k -> json.createArrayNode()).add(e);
        });
        return jdbc.query("SELECT f.*, r.codigo AS reserva_codigo FROM facturas f LEFT JOIN reservas r ON r.id = f.reserva_id ORDER BY f.id DESC", (rs, n) -> {
            long id = rs.getLong("id");
            ObjectNode o = json.createObjectNode();
            o.put("id", String.valueOf(id));
            o.put("number", Objects.toString(rs.getString("numero"), ""));
            long reserva = rs.getLong("reserva_id");
            o.put("reservationId", rs.wasNull() ? "" : String.valueOf(reserva));
            o.put("reservationCode", Objects.toString(rs.getString("reserva_codigo"), ""));
            o.put("billTo", rs.getString("facturar_a"));
            try { o.set("buyer", json.readTree(rs.getString("comprador"))); } catch (Exception ex) { o.set("buyer", json.createObjectNode()); }
            o.set("lines", lineas.getOrDefault(id, json.createArrayNode()));
            o.put("paymentTerm", rs.getString("forma_pago"));
            o.put("dueDate", rs.getDate("fecha_vencimiento").toLocalDate().toString());
            o.put("dianStatus", rs.getString("estado_dian"));
            fecha(o, "issuedAt", rs.getTimestamp("emitida_at"));
            fecha(o, "fiscalValidatedAt", rs.getTimestamp("datos_validados_at"));
            fecha(o, "dianValidatedAt", rs.getTimestamp("validada_at"));
            if (rs.getString("cufe") != null) o.put("cufe", rs.getString("cufe"));
            if (rs.getString("motivo_rechazo") != null) o.put("rejectionReason", rs.getString("motivo_rechazo"));
            if (rs.getString("enviada_canal") != null) {
                ObjectNode s = o.putObject("sentVia");
                s.put("channel", rs.getString("enviada_canal"));
                s.put("to", Objects.toString(rs.getString("enviada_a"), ""));
                fecha(s, "at", rs.getTimestamp("enviada_at"));
            }
            if (rs.getString("nota_credito") != null) {
                ObjectNode a = o.putObject("annulment");
                a.put("creditNote", rs.getString("nota_credito"));
                a.put("reason", Objects.toString(rs.getString("motivo_anulacion"), ""));
                fecha(a, "at", rs.getTimestamp("anulada_at"));
                a.put("by", Objects.toString(rs.getString("anulada_por_nombre"), ""));
            }
            o.put("createdBy", Objects.toString(rs.getString("creado_por_nombre"), ""));
            if (rs.getString("emitida_por_nombre") != null) o.put("issuedBy", rs.getString("emitida_por_nombre"));
            o.set("events", eventos.getOrDefault(id, json.createArrayNode()));
            return o;
        });
    }

    private ObjectNode buscar(long id) {
        return listar().stream().filter(f -> f.path("id").asText().equals(String.valueOf(id))).findFirst()
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "La factura no existe"));
    }

    private String estado(long id) {
        List<String> e = jdbc.queryForList("SELECT estado_dian FROM facturas WHERE id = ?", String.class, id);
        if (e.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "La factura no existe");
        return e.get(0);
    }

    // ── Borradores ───────────────────────────────────────

    /** Crea o actualiza un borrador (con sus líneas y comprador). */
    public ObjectNode guardarBorrador(JsonNode b, Long uid, String nombre) {
        return tx.execute(s -> {
            long id = b.path("id").asText("").matches("\\d+") ? b.path("id").asLong() : 0;
            if (id > 0 && !"Borrador".equals(estado(id))) throw new ResponseStatusException(CONFLICT, "Solo un borrador se puede modificar");
            id = escribir(id, b, uid, nombre);
            if (b.path("fiscalValidatedAt").asText("").length() >= 16) jdbc.update("UPDATE facturas SET datos_validados_at = NOW() WHERE id = ?", id);
            return buscar(id);
        });
    }

    public void eliminarBorrador(long id) {
        tx.executeWithoutResult(s -> {
            if (!"Borrador".equals(estado(id))) throw new ResponseStatusException(CONFLICT, "Solo se eliminan borradores; una factura emitida se anula con nota crédito");
            jdbc.update("DELETE FROM facturas WHERE id = ?", id);
        });
    }

    /** Inserta o actualiza la cabecera y reemplaza las líneas. Devuelve el id. */
    private long escribir(long id, JsonNode b, Long uid, String nombre) {
        Long reserva = b.path("reservationId").asText("").matches("\\d+") ? b.path("reservationId").asLong() : null;
        if (reserva == null) throw new ResponseStatusException(BAD_REQUEST, "La factura debe estar asociada a una reserva");
        JsonNode comprador = b.path("buyer");
        Long tercero = tercero(comprador);
        String facturarA = "Empresa".equals(b.path("billTo").asText()) ? "Empresa" : "Huésped";
        String forma = "Crédito".equals(b.path("paymentTerm").asText()) ? "Crédito" : "Contado";
        LocalDate vence = fechaODefecto(b.path("dueDate").asText(""));
        String compradorJson = comprador.isObject() ? comprador.toString() : "{}";
        if (id == 0) {
            GeneratedKeyHolder k = new GeneratedKeyHolder();
            jdbc.update(c -> {
                PreparedStatement ps = c.prepareStatement("INSERT INTO facturas (reserva_id, tercero_id, facturar_a, comprador, forma_pago, fecha_vencimiento, estado_dian, creado_por, creado_por_nombre, actualizado_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 'Borrador', ?, ?, NOW())", Statement.RETURN_GENERATED_KEYS);
                ps.setLong(1, reserva);
                ps.setObject(2, tercero);
                ps.setString(3, facturarA);
                ps.setString(4, compradorJson);
                ps.setString(5, forma);
                ps.setObject(6, vence);
                ps.setObject(7, uid);
                ps.setString(8, nombre);
                return ps;
            }, k);
            id = Objects.requireNonNull(k.getKey()).longValue();
        } else {
            jdbc.update("UPDATE facturas SET reserva_id = ?, tercero_id = ?, facturar_a = ?, comprador = ?, forma_pago = ?, fecha_vencimiento = ?, actualizado_at = NOW() WHERE id = ?",
                    reserva, tercero, facturarA, compradorJson, forma, vence, id);
            jdbc.update("DELETE FROM factura_lineas WHERE factura_id = ?", id);
        }
        int orden = 0;
        for (JsonNode l : b.path("lines")) {
            String cat = l.path("category").asText("Otro");
            if (!CATEGORIAS.contains(cat)) cat = "Otro";
            String consumo = l.path("chargeId").asText("");
            Long consumoId = consumo.matches("\\d+") ? Long.valueOf(consumo) : null;
            if (consumoId != null && jdbc.queryForObject("SELECT COUNT(*) FROM consumos WHERE id = ?", Integer.class, consumoId) == 0) consumoId = null;
            jdbc.update("INSERT INTO factura_lineas (factura_id, orden, categoria, descripcion, detalle, periodo, cantidad, unidad, valor_unitario, descuento_pct, descuento_motivo, "
                            + "tipo_impuesto, tarifa_impuesto, incluida, consumo_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    id, orden++, cat, corto(l.path("description").asText("Concepto"), 200), corto(l.path("detail").asText(""), 200), corto(l.path("dateLabel").asText(""), 30),
                    num(l.path("quantity"), 2), corto(l.path("unitLabel").asText(""), 20), num(l.path("unitValue"), 2),
                    num(l.path("discountPct"), 2).min(BigDecimal.valueOf(100)).max(BigDecimal.ZERO), corto(l.path("discountLabel").asText(""), 60),
                    "INC".equals(l.path("taxKind").asText()) ? "INC" : "IVA", num(l.path("taxRate"), 4), l.path("included").asBoolean(true), consumoId);
        }
        return id;
    }

    /** Comprador como tercero (un documento = un registro). Sin documento todavía: null. */
    private Long tercero(JsonNode c) {
        String tipo = c.path("docType").asText("").trim(), numero = c.path("docNumber").asText("").trim(), nombre = c.path("name").asText("").trim();
        if (tipo.isEmpty() || numero.isEmpty() || nombre.isEmpty()) return null;
        jdbc.update("INSERT INTO terceros (tipo_persona, tipo_documento, numero_documento, dv, nombre, responsabilidad_fiscal, email, telefono, pais, departamento, ciudad, direccion, es_cliente) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE tipo_persona = VALUES(tipo_persona), dv = VALUES(dv), nombre = VALUES(nombre), "
                        + "responsabilidad_fiscal = VALUES(responsabilidad_fiscal), email = VALUES(email), telefono = VALUES(telefono), pais = VALUES(pais), "
                        + "departamento = VALUES(departamento), ciudad = VALUES(ciudad), direccion = VALUES(direccion), es_cliente = 1",
                "Jurídica".equals(c.path("personType").asText()) ? "Jurídica" : "Natural", corto(tipo, 5), corto(numero, 30),
                c.path("dv").asText("").isBlank() ? null : c.path("dv").asText().substring(0, 1), corto(nombre, 200),
                corto(c.path("fiscalResponsibility").asText("R-99-PN").split(" ")[0], 20), corto(c.path("email").asText(""), 120), corto(c.path("phone").asText(""), 30),
                corto(c.path("country").asText("Colombia"), 60), corto(c.path("department").asText(""), 60), corto(c.path("city").asText(""), 60), corto(c.path("address").asText(""), 200));
        return jdbc.queryForObject("SELECT id FROM terceros WHERE tipo_documento = ? AND numero_documento = ?", Long.class, corto(tipo, 5), corto(numero, 30));
    }

    // ── Emisión ──────────────────────────────────────────

    /** Guarda los datos finales, valida, asigna el número de la resolución y la deja en validación. */
    public synchronized ObjectNode emitir(long id, JsonNode b, Long uid, String nombre) {
        return tx.execute(s -> {
            if (id > 0 && !"Borrador".equals(estado(id))) throw new ResponseStatusException(CONFLICT, "La factura ya fue emitida");
            long fid = escribir(id, b, uid, nombre);
            List<String> e = validarEmision(fid, b);
            if (!e.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "No se puede emitir: " + String.join(", ", e));
            JsonNode r = configCompleta().path("resolution");
            String prefijo = r.path("prefix").asText();
            long numero = Math.max(ultimoNumero(prefijo), r.path("from").asLong() - 1) + 1;
            jdbc.update("INSERT INTO consecutivos (prefijo, anio, ultimo) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE ultimo = ?", "F:" + prefijo, numero, numero);
            String nro = prefijo + "-" + numero;
            LocalDate hoy = LocalDate.now();
            jdbc.update("UPDATE facturas SET numero = ?, estado_dian = 'En validación', emitida_at = NOW(), emitida_por_nombre = ?, datos_validados_at = COALESCE(datos_validados_at, NOW()), "
                            + "fecha_vencimiento = CASE WHEN forma_pago = 'Contado' THEN ? ELSE fecha_vencimiento END, actualizado_at = NOW() WHERE id = ?",
                    nro, nombre, hoy, fid);
            jdbc.update("UPDATE consumos c JOIN factura_lineas l ON l.consumo_id = c.id SET c.factura_id = ? WHERE l.factura_id = ? AND l.incluida = 1", fid, fid);
            evento(fid, "Datos fiscales validados", nombre, "muted");
            evento(fid, "Factura emitida", nombre, "info");
            String proveedor = configCompleta().path("provider").path("name").asText("");
            evento(fid, "Pendiente de validación DIAN", proveedor.isBlank() ? "Registra la respuesta de la DIAN (CUFE o motivo de rechazo)" : "Enviar o validar en " + proveedor, "info");
            return buscar(fid);
        });
    }

    private List<String> validarEmision(long id, JsonNode b) {
        List<String> e = new ArrayList<>();
        JsonNode r = configCompleta().path("resolution");
        LocalDate hoy = LocalDate.now();
        if (r.path("number").asText("").isBlank()) e.add("falta el número de la resolución de facturación (Facturación › Configuración)");
        String vd = r.path("validFrom").asText(""), vh = r.path("validTo").asText("");
        if (vd.isEmpty() || vh.isEmpty()) e.add("falta la vigencia de la resolución");
        else if (hoy.isBefore(LocalDate.parse(vd)) || hoy.isAfter(LocalDate.parse(vh))) e.add("la resolución de facturación no está vigente");
        long siguiente = Math.max(ultimoNumero(r.path("prefix").asText()), r.path("from").asLong() - 1) + 1;
        if (siguiente > r.path("to").asLong()) e.add("se agotó el rango autorizado de la resolución");
        JsonNode h = config.leer("hospedaje").orElse(json.createObjectNode());
        if (h.path("nit").asText("").isBlank()) e.add("falta el NIT del hospedaje (Configuración › Datos del hospedaje)");
        if (h.path("legalName").asText("").isBlank() && h.path("commercialName").asText("").isBlank()) e.add("falta el nombre del hospedaje");

        JsonNode c = b.path("buyer");
        if (c.path("name").asText("").trim().length() < 3) e.add("falta el nombre del adquiriente");
        if (c.path("docNumber").asText("").isBlank()) e.add("falta el documento del adquiriente");
        if (!EMAIL.matcher(c.path("email").asText("").trim()).matches()) e.add("el correo del adquiriente no es válido");
        if (c.path("address").asText("").isBlank()) e.add("falta la dirección del adquiriente");

        BigDecimal total = jdbc.queryForObject("SELECT COALESCE(SUM(cantidad * valor_unitario * (1 - descuento_pct / 100) * (1 + tarifa_impuesto)), 0) FROM factura_lineas WHERE factura_id = ? AND incluida = 1",
                BigDecimal.class, id);
        if (total == null || total.signum() <= 0) e.add("la factura no tiene conceptos con valor");
        Integer otra = jdbc.queryForObject("SELECT COUNT(*) FROM facturas WHERE reserva_id = (SELECT reserva_id FROM facturas WHERE id = ?) AND id <> ? "
                + "AND estado_dian <> 'Borrador' AND nota_credito IS NULL", Integer.class, id, id);
        if (otra != null && otra > 0) e.add("la reserva ya tiene una factura vigente (anúlala con nota crédito para facturar de nuevo)");
        Integer ajenos = jdbc.queryForObject("SELECT COUNT(*) FROM factura_lineas l JOIN consumos c ON c.id = l.consumo_id "
                + "WHERE l.factura_id = ? AND l.incluida = 1 AND c.factura_id IS NOT NULL AND c.factura_id <> ?", Integer.class, id, id);
        if (ajenos != null && ajenos > 0) e.add("hay consumos que ya están en otra factura");
        return e;
    }

    /** Último número emitido con un prefijo (0 si no hay). */
    private long ultimoNumero(String prefijo) {
        if (prefijo == null || prefijo.isBlank()) return 0;
        List<Long> c = jdbc.queryForList("SELECT ultimo FROM consecutivos WHERE prefijo = ? AND anio = 0", Long.class, "F:" + prefijo);
        Long max = jdbc.queryForObject("SELECT MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) FROM facturas WHERE numero LIKE ?", Long.class, prefijo + "-%");
        return Math.max(c.isEmpty() ? 0 : c.get(0), max == null ? 0 : max);
    }

    // ── Después de emitir ────────────────────────────────

    /** Respuesta de la DIAN (desde el proveedor): aceptada con CUFE, o rechazada con el motivo. */
    public ObjectNode respuestaDian(long id, JsonNode b, String nombre) {
        return tx.execute(s -> {
            if (!"En validación".equals(estado(id))) throw new ResponseStatusException(CONFLICT, "La factura no está pendiente de validación");
            if (b.path("accepted").asBoolean(false)) {
                String cufe = normalizarCufe(b.path("cufe").asText(""));
                if (!CUFE.matcher(cufe).matches()) throw new ResponseStatusException(BAD_REQUEST,
                        "El CUFE no es válido: debe tener exactamente 96 caracteres, solo números del 0 al 9 y letras de la a a la f (tiene " + cufe.length() + ")");
                Integer usado = jdbc.queryForObject("SELECT COUNT(*) FROM facturas WHERE cufe = ? AND id <> ?", Integer.class, cufe, id);
                if (usado != null && usado > 0) throw new ResponseStatusException(CONFLICT, "Ese CUFE ya está registrado en otra factura");
                jdbc.update("UPDATE facturas SET estado_dian = 'Aceptada', cufe = ?, motivo_rechazo = NULL, validada_at = NOW(), actualizado_at = NOW() WHERE id = ?", cufe, id);
                evento(id, "Aceptada por la DIAN", "CUFE registrado por " + nombre, "ok");
            } else {
                String motivo = b.path("reason").asText("").trim();
                if (motivo.length() < 5) throw new ResponseStatusException(BAD_REQUEST, "Escribe el motivo del rechazo que informó la DIAN");
                jdbc.update("UPDATE facturas SET estado_dian = 'Rechazada', motivo_rechazo = ?, actualizado_at = NOW() WHERE id = ?", corto(motivo, 500), id);
                evento(id, "Rechazada por la DIAN", motivo, "danger");
            }
            return buscar(id);
        });
    }

    /**
     * CUFE tal como se pega: quita espacios y saltos de línea, y si viene el enlace de consulta de la
     * DIAN (el del código QR, …?documentkey=CUFE) toma solo el CUFE. Queda en minúsculas.
     */
    static String normalizarCufe(String texto) {
        String t = texto == null ? "" : texto.replaceAll("\\s+", "");
        int i = t.toLowerCase().indexOf("documentkey=");
        if (i >= 0) {
            t = t.substring(i + "documentkey=".length());
            int fin = t.indexOf('&');
            if (fin >= 0) t = t.substring(0, fin);
        }
        java.util.regex.Matcher m = Pattern.compile("[0-9a-fA-F]{96}").matcher(t);
        if (t.length() > 96 && m.find()) t = m.group();
        return t.toLowerCase();
    }

    /** Corrige el comprador de una factura rechazada y la deja otra vez en validación (mismo número). */
    public ObjectNode corregir(long id, JsonNode b, String nombre) {
        return tx.execute(s -> {
            if (!"Rechazada".equals(estado(id))) throw new ResponseStatusException(CONFLICT, "Solo se corrige una factura rechazada por la DIAN");
            JsonNode c = b.path("buyer");
            if (!EMAIL.matcher(c.path("email").asText("").trim()).matches() || c.path("docNumber").asText("").isBlank() || c.path("name").asText("").isBlank())
                throw new ResponseStatusException(BAD_REQUEST, "Completa el nombre, el documento y un correo válido del adquiriente");
            jdbc.update("UPDATE facturas SET comprador = ?, tercero_id = ?, estado_dian = 'En validación', motivo_rechazo = NULL, datos_validados_at = NOW(), actualizado_at = NOW() WHERE id = ?",
                    c.toString(), tercero(c), id);
            evento(id, "Datos fiscales corregidos", nombre, "info");
            evento(id, "Reenviada para validación DIAN", "", "info");
            return buscar(id);
        });
    }

    public ObjectNode registrarEnvio(long id, JsonNode b, String nombre) {
        String canal = "WhatsApp".equals(b.path("channel").asText()) ? "WhatsApp" : "Correo";
        String para = b.path("to").asText("").trim();
        if (para.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Falta el destinatario");
        if ("Borrador".equals(estado(id))) throw new ResponseStatusException(CONFLICT, "Un borrador no se envía");
        jdbc.update("UPDATE facturas SET enviada_canal = ?, enviada_a = ?, enviada_at = NOW() WHERE id = ?", canal, corto(para, 120), id);
        evento(id, "Enviada por " + ("Correo".equals(canal) ? "correo" : "WhatsApp"), para + " · " + nombre, "info");
        return buscar(id);
    }

    /**
     * Envía la factura por correo (cuenta de correo.local.properties): el mensaje y el resumen de la
     * factura con los datos del hospedaje. Solo facturas aceptadas por la DIAN.
     */
    public ObjectNode enviarCorreo(long id, JsonNode b, String nombre) {
        ObjectNode f = buscar(id);
        if (!"Aceptada".equals(f.path("dianStatus").asText()) || f.has("annulment")) throw new ResponseStatusException(CONFLICT, "Solo se envía una factura aceptada por la DIAN y sin anular");
        List<String> para = new ArrayList<>();
        for (String x : (b.path("to").asText("") + "," + b.path("cc").asText("")).split(",")) {
            String e = x.trim();
            if (e.isEmpty()) continue;
            if (!EMAIL.matcher(e).matches()) throw new ResponseStatusException(BAD_REQUEST, "El correo «" + e + "» no es válido");
            para.add(e);
        }
        if (para.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Falta el correo del destinatario");
        if (!correo.configurado()) throw new ResponseStatusException(SERVICE_UNAVAILABLE, "El correo de SOGO aún no está listo: " + correo.faltante() + " (Configuración › Notificaciones)");
        String asunto = corto(b.path("subject").asText("Factura " + f.path("number").asText()), 200);
        String mensaje = b.path("body").asText("");
        boolean ok = correo.enviarHtml(String.join(",", para), asunto, mensaje + "\n\n" + resumenTexto(f), correoHtml(f, mensaje));
        if (!ok) throw new ResponseStatusException(BAD_GATEWAY, correo.ultimoError().isBlank() ? "No se pudo enviar el correo" : correo.ultimoError());
        return registrarEnvio(id, json.createObjectNode().put("channel", "Correo").put("to", String.join(", ", para)), nombre);
    }

    private String resumenTexto(ObjectNode f) {
        return "Factura " + f.path("number").asText() + " · CUFE " + f.path("cufe").asText("") + " · Total " + pesos(total(f));
    }

    private static BigDecimal neto(JsonNode l) {
        BigDecimal bruto = l.path("unitValue").decimalValue().multiply(l.path("quantity").decimalValue());
        BigDecimal desc = bruto.multiply(l.path("discountPct").decimalValue()).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
        return bruto.subtract(desc).setScale(0, RoundingMode.HALF_UP);
    }

    private static BigDecimal total(ObjectNode f) {
        BigDecimal t = BigDecimal.ZERO;
        for (JsonNode l : f.path("lines")) {
            if (!l.path("included").asBoolean(true)) continue;
            BigDecimal n = neto(l);
            t = t.add(n).add(n.multiply(l.path("taxRate").decimalValue()).setScale(0, RoundingMode.HALF_UP));
        }
        return t;
    }

    private static String pesos(BigDecimal v) {
        return "$ " + String.format(Locale.ROOT, "%,d", v.setScale(0, RoundingMode.HALF_UP).longValue()).replace(',', '.');
    }

    private String correoHtml(ObjectNode f, String mensaje) {
        JsonNode h = config.leer("hospedaje").orElse(json.createObjectNode());
        StringBuilder filas = new StringBuilder();
        for (JsonNode l : f.path("lines")) {
            if (!l.path("included").asBoolean(true)) continue;
            filas.append("<tr><td style=\"padding:6px 8px;border-bottom:1px solid #EEF1F5\">").append(esc(l.path("description").asText()))
                 .append("</td><td style=\"padding:6px 8px;border-bottom:1px solid #EEF1F5;text-align:right\">").append(pesos(neto(l))).append("</td></tr>");
        }
        String nombre = h.path("commercialName").asText(h.path("legalName").asText(""));
        return """
            <div style="font-family:Arial,Helvetica,sans-serif;background:#F4F7FB;padding:24px 12px">
              <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E6EBF2;border-radius:12px;overflow:hidden">
                <div style="background:#0A3D6D;color:#fff;padding:18px 24px">
                  <div style="font-size:18px;font-weight:bold">%s</div>
                  <div style="font-size:12px;opacity:.85">NIT %s · %s</div>
                </div>
                <div style="padding:22px 24px;color:#1F2937;font-size:14px;line-height:1.6">
                  <p style="margin:0 0 16px;white-space:pre-line">%s</p>
                  <p style="margin:0 0 4px;font-size:12px;color:#6B7280">Factura electrónica de venta</p>
                  <p style="margin:0 0 12px;font-size:20px;font-weight:bold;color:#0A2540">%s</p>
                  <table style="width:100%%;border-collapse:collapse;font-size:13px">%s
                    <tr><td style="padding:8px;font-weight:bold">Total</td><td style="padding:8px;text-align:right;font-weight:bold">%s</td></tr></table>
                  <p style="margin:16px 0 0;font-size:11px;color:#6B7280;word-break:break-all">CUFE: %s</p>
                </div>
              </div>
            </div>""".formatted(esc(nombre), esc(h.path("nit").asText("")), esc(h.path("address").asText("") + " · " + h.path("municipality").asText("")),
                esc(mensaje), esc(f.path("number").asText()), filas, pesos(total(f)), esc(f.path("cufe").asText("")));
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    public ObjectNode registrarDescarga(long id, String que, String nombre) {
        estado(id);
        evento(id, ("XML".equals(que) ? "XML" : "PDF") + " descargado", nombre, "muted");
        return buscar(id);
    }

    public ObjectNode registrarPago(long id, String detalle, String nombre) {
        estado(id);
        evento(id, "Pago registrado", corto(detalle, 400) + " · " + nombre, "ok");
        return buscar(id);
    }

    /** Anula con nota crédito (numeración propia) y libera los consumos para otra factura. */
    public synchronized ObjectNode anular(long id, String motivo, String nombre) {
        return tx.execute(s -> {
            String e = estado(id);
            if ("Borrador".equals(e)) throw new ResponseStatusException(CONFLICT, "Un borrador se elimina, no se anula");
            Integer anulada = jdbc.queryForObject("SELECT COUNT(*) FROM facturas WHERE id = ? AND nota_credito IS NOT NULL", Integer.class, id);
            if (anulada != null && anulada > 0) throw new ResponseStatusException(CONFLICT, "La factura ya está anulada");
            String m = motivo == null ? "" : motivo.trim();
            if (m.length() < 5) throw new ResponseStatusException(BAD_REQUEST, "Indica el motivo de la anulación");
            String prefijo = configCompleta().path("resolution").path("creditPrefix").asText("NCE");
            String clave = "N:" + prefijo;
            jdbc.update("INSERT IGNORE INTO consecutivos (prefijo, anio, ultimo) VALUES (?, 0, 0)", clave);
            jdbc.update("UPDATE consecutivos SET ultimo = ultimo + 1 WHERE prefijo = ? AND anio = 0", clave);
            Integer n = jdbc.queryForObject("SELECT ultimo FROM consecutivos WHERE prefijo = ? AND anio = 0", Integer.class, clave);
            String nota = prefijo + "-" + n;
            jdbc.update("UPDATE facturas SET nota_credito = ?, motivo_anulacion = ?, anulada_at = NOW(), anulada_por_nombre = ?, actualizado_at = NOW() WHERE id = ?",
                    nota, corto(m, 255), nombre, id);
            jdbc.update("UPDATE consumos SET factura_id = NULL WHERE factura_id = ?", id);
            evento(id, "Anulada con nota crédito " + nota, m + " · " + nombre, "danger");
            return buscar(id);
        });
    }

    // ── Utilidades ───────────────────────────────────────

    private void evento(long id, String titulo, String detalle, String tono) {
        jdbc.update("INSERT INTO factura_eventos (factura_id, titulo, detalle, tono) VALUES (?, ?, ?, ?)", id, corto(titulo, 120), corto(detalle, 500), tono);
    }

    private static void fecha(ObjectNode o, String campo, Timestamp t) {
        if (t != null) o.put(campo, t.toLocalDateTime().withNano(0).format(ISO));
    }

    private static LocalDate fechaODefecto(String s) {
        try { return LocalDate.parse(s); } catch (Exception e) { return LocalDate.now(); }
    }

    private static BigDecimal num(JsonNode n, int escala) {
        BigDecimal v = n.isNumber() ? n.decimalValue() : BigDecimal.ZERO;
        return v.max(BigDecimal.ZERO).setScale(escala, RoundingMode.HALF_UP);
    }

    private static String corto(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }
}
