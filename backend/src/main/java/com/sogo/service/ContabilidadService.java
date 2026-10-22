package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;

import static java.util.Map.entry;
import static org.springframework.http.HttpStatus.*;

/**
 * Contabilidad en la base de datos (`asientos`, `asiento_lineas`, `asiento_soportes`).
 *  · Los comprobantes manuales los valida y numera el servidor (CI/CE/NC/CT/SI-año-0001).
 *  · Los integrados llegan calculados desde los módulos (Reservas, Alojamiento, Nómina,
 *    Inventarios) con una clave de origen: integrar dos veces no duplica; si el origen cambia,
 *    el asiento se actualiza y conserva su número; si desaparece, se anula.
 *  · Ajustes (configuracion 'contabilidad'): inicio de la contabilidad en SOGO, meses cerrados
 *    (nada se registra, cambia ni anula en ellos) y cuenta de ingreso por categoría de consumo.
 */
@Service
public class ContabilidadService {

    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    static final Map<String, String> PREFIJOS = Map.ofEntries(
            entry("Ingreso", "RC"), entry("Cobro", "RC"), entry("Egreso", "CE"), entry("Pago", "CE"), entry("Venta", "FV"),
            entry("Ajuste", "NCO"), entry("Provisión", "NCO"), entry("Causación", "NCO"), entry("Traslado", "NCO"), entry("Apertura", "NCO"),
            entry("Nota crédito", "NC"), entry("Nota débito", "ND"));
    private static final List<String> MANUALES = List.of("Ingreso", "Egreso", "Ajuste", "Provisión", "Pago", "Cobro", "Traslado", "Causación", "Apertura",
            "Nota crédito", "Nota débito");
    /** Categoría del comprobante de cierre anual (uno por año, fechado el 31 de diciembre). */
    private static final String CIERRE = "Cierre del ejercicio";
    private static final List<String> MOTIVOS_NOTA =List.of("Error", "Devolución", "Rebaja", "Anulación", "Cobro adicional");
    private static final List<String> MODULOS = List.of("Reservas", "Alojamiento", "Facturación", "Nómina", "Inventarios");
    private static final List<String> ESTADOS_INTEGRADOS = List.of("Contabilizado", "Provisional", "Anulado");
    private static final List<String> CLASES = List.of("Activo", "Pasivo", "Patrimonio", "Ingreso", "Gasto", "Costo");
    private static final String INICIO_POR_DEFECTO = "2026-09-01";

    private final JdbcTemplate jdbc;
    private final ConfiguracionService config;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public ContabilidadService(JdbcTemplate jdbc, ConfiguracionService config, ObjectMapper json, PlatformTransactionManager txManager) {
        this.jdbc = jdbc;
        this.config = config;
        this.json = json;
        this.tx = new TransactionTemplate(txManager);
    }

    // ── Ajustes ──────────────────────────────────────────

    /** { inicio: 'YYYY-MM-DD', cerradoHasta: 'YYYY-MM' | null, mapping: { categoría: cuenta } } */
    public ObjectNode ajustes() {
        ObjectNode a = config.leer("contabilidad").filter(JsonNode::isObject).map(v -> ((ObjectNode) v).deepCopy()).orElseGet(json::createObjectNode);
        if (!a.path("inicio").isTextual()) a.put("inicio", INICIO_POR_DEFECTO);
        if (!a.has("cerradoHasta")) a.putNull("cerradoHasta");
        if (!a.path("mapping").isObject()) a.set("mapping", json.createObjectNode());
        if (!a.path("emisor").isObject()) {
            ObjectNode e = a.putObject("emisor");
            e.put("nombre", "Hospedaje Sebastián"); e.put("propietario", ""); e.put("nit", ""); e.put("direccion", ""); e.put("telefono", "");
        }
        return a;
    }

    private LocalDate inicio() { return LocalDate.parse(ajustes().path("inicio").asText(INICIO_POR_DEFECTO)); }

    private YearMonth cerradoHasta() {
        String c = ajustes().path("cerradoHasta").asText("");
        return c.matches("\\d{4}-\\d{2}") ? YearMonth.parse(c) : null;
    }

    private static boolean cerrado(LocalDate fecha, YearMonth hasta) { return hasta != null && !YearMonth.from(fecha).isAfter(hasta); }

    public ObjectNode guardarAjustes(JsonNode body, Long uid) {
        ObjectNode a = ajustes();
        if (body.has("inicio")) {
            String inicio = body.path("inicio").asText("");
            if (!inicio.matches("\\d{4}-\\d{2}-\\d{2}")) throw new ResponseStatusException(BAD_REQUEST, "Fecha de inicio no válida");
            if (LocalDate.parse(inicio).isAfter(LocalDate.now())) throw new ResponseStatusException(BAD_REQUEST, "La contabilidad no puede iniciar en una fecha futura");
            a.put("inicio", inicio);
        }
        if (body.has("cerradoHasta")) {
            String c = body.path("cerradoHasta").asText("");
            if (body.path("cerradoHasta").isNull() || c.isBlank()) a.putNull("cerradoHasta");
            else {
                if (!c.matches("\\d{4}-(0[1-9]|1[0-2])")) throw new ResponseStatusException(BAD_REQUEST, "Mes de cierre no válido");
                if (!YearMonth.parse(c).isBefore(YearMonth.now())) throw new ResponseStatusException(BAD_REQUEST, "Solo se pueden cerrar meses ya terminados");
                a.put("cerradoHasta", c);
            }
        }
        if (body.path("mapping").isObject()) {
            Map<String, String> clases = clasesDeCuentas();
            ObjectNode m = json.createObjectNode();
            body.path("mapping").fields().forEachRemaining(x -> {
                String cuenta = x.getValue().asText("");
                if (cuenta.isEmpty()) return;
                if (!"Ingreso".equals(clases.get(cuenta))) throw new ResponseStatusException(BAD_REQUEST, "La cuenta " + cuenta + " no es una cuenta de ingreso");
                m.put(x.getKey(), cuenta);
            });
            a.set("mapping", m);
        }
        if (body.path("emisor").isObject()) {
            ObjectNode e = a.putObject("emisor");
            for (String k : List.of("nombre", "propietario", "nit", "direccion", "telefono")) e.put(k, corto(body.path("emisor").path(k).asText("").trim(), 120));
            if (e.path("nombre").asText().length() < 3) throw new ResponseStatusException(BAD_REQUEST, "Escribe el nombre del hospedaje para los comprobantes");
        }
        config.guardar("contabilidad", a, uid);
        return a;
    }

    // ── Plan de cuentas ──────────────────────────────────

    /**
     * Cuentas que SOGO usa al integrar los módulos y en los formularios (caja, bancos, cartera,
     * anticipos, impuestos, nómina, inventario...). Se les puede cambiar el nombre, pero no el
     * código ni la clase, y no se eliminan ni desactivan: la integración dejaría de cuadrar.
     */
    private static final Set<String> DEL_SISTEMA = Set.of(
            "110505", "1110", "130505", "143505", "220505", "236515", "236525", "236540", "237005", "237006", "237010", "237025",
            "237095", "238030", "240805", "240810", "249505", "250505", "261005", "261010", "261015", "261020", "261095",
            "28101501", "311505", "414005", "41409501", "41409595", "421005", "425050",
            "520506", "520515", "520527", "520530", "520533", "520536", "520539", "520548", "520551", "520568", "520569", "520570",
            "520572", "520575", "520578", "521030", "521505", "523520", "523525", "523530", "523535",
            "524510", "524515", "529525", "529530", "530505", "531095");

    /** Cuentas del sistema más las asignadas a categorías de ingreso en los ajustes. */
    private Set<String> protegidas() {
        Set<String> s = new HashSet<>(DEL_SISTEMA);
        ajustes().path("mapping").forEach(v -> s.add(v.asText()));
        return s;
    }

    @Transactional(readOnly = true)
    public List<ObjectNode> cuentas() {
        Map<String, Integer> usos = new HashMap<>();
        jdbc.query("SELECT cuenta_codigo, COUNT(*) FROM asiento_lineas GROUP BY cuenta_codigo", rs -> { usos.put(rs.getString(1), rs.getInt(2)); });
        Set<String> protegidas = protegidas();
        return jdbc.query("SELECT codigo, nombre, clase, corriente, contraria, activa FROM cuentas_puc ORDER BY codigo", (rs, i) -> {
            ObjectNode o = json.createObjectNode();
            o.put("code", rs.getString("codigo"));
            o.put("name", rs.getString("nombre"));
            o.put("cls", rs.getString("clase"));
            o.put("current", rs.getBoolean("corriente"));
            o.put("contra", rs.getBoolean("contraria"));
            o.put("active", rs.getBoolean("activa"));
            o.put("system", protegidas.contains(rs.getString("codigo")));
            o.put("uses", usos.getOrDefault(rs.getString("codigo"), 0));
            return o;
        });
    }

    private Map<String, String> clasesDeCuentas() {
        Map<String, String> m = new HashMap<>();
        jdbc.query("SELECT codigo, clase FROM cuentas_puc", rs -> { m.put(rs.getString(1), rs.getString(2)); });
        return m;
    }

    /**
     * Crea una cuenta (sin `originalCode`) o la edita: nombre, clase, código, corriente, naturaleza
     * contraria y si está activa. Si cambia el código, sus movimientos pasan al código nuevo
     * (los comprobantes conservan número y valores), salvo que alguno esté en un mes cerrado.
     */
    @Transactional
    public ObjectNode guardarCuenta(JsonNode b) {
        String original = b.path("originalCode").asText("").trim();
        String codigo = b.path("code").asText("").trim();
        String nombre = corto(b.path("name").asText("").trim(), 150);
        String clase = b.path("cls").asText("");
        boolean activa = b.path("active").asBoolean(true);
        boolean corriente = ("Activo".equals(clase) || "Pasivo".equals(clase)) && b.path("current").asBoolean(false);
        boolean contraria = b.path("contra").asBoolean(false);
        if (!codigo.matches("\\d{1,10}")) throw new ResponseStatusException(BAD_REQUEST, "El código debe tener entre 1 y 10 dígitos");
        if (nombre.length() < 3) throw new ResponseStatusException(BAD_REQUEST, "Escribe el nombre de la cuenta");
        validarClase(codigo, clase);
        Map<String, String> clases = clasesDeCuentas();

        if (original.isEmpty()) {
            if (clases.containsKey(codigo)) throw new ResponseStatusException(CONFLICT, "Ya existe la cuenta " + codigo);
            jdbc.update("INSERT INTO cuentas_puc (codigo, nombre, clase, corriente, contraria, activa) VALUES (?, ?, ?, ?, ?, ?)",
                    codigo, nombre, clase, corriente, contraria, activa);
            return cuenta(codigo);
        }

        if (!clases.containsKey(original)) throw new ResponseStatusException(NOT_FOUND, "La cuenta " + original + " no existe");
        boolean protegida = protegidas().contains(original);
        boolean cambiaCodigo = !codigo.equals(original);
        if (protegida && (cambiaCodigo || !clase.equals(clases.get(original)))) {
            throw new ResponseStatusException(CONFLICT, "SOGO usa la cuenta " + original + " para integrar los módulos: solo se le puede cambiar el nombre");
        }
        if (protegida && !activa) throw new ResponseStatusException(CONFLICT, "SOGO usa la cuenta " + original + " para integrar los módulos: no se puede desactivar");
        if (!cambiaCodigo) {
            jdbc.update("UPDATE cuentas_puc SET nombre = ?, clase = ?, corriente = ?, contraria = ?, activa = ? WHERE codigo = ?",
                    nombre, clase, corriente, contraria, activa, codigo);
            return cuenta(codigo);
        }
        if (clases.containsKey(codigo)) throw new ResponseStatusException(CONFLICT, "Ya existe la cuenta " + codigo);
        exigirSinMovimientosCerrados(original, "cambiar su código");
        // Cuenta nueva → sus movimientos → se quita la anterior (las líneas apuntan a cuentas_puc)
        jdbc.update("INSERT INTO cuentas_puc (codigo, nombre, clase, corriente, contraria, activa) VALUES (?, ?, ?, ?, ?, ?)",
                codigo, nombre, clase, corriente, contraria, activa);
        jdbc.update("UPDATE asiento_lineas SET cuenta_codigo = ? WHERE cuenta_codigo = ?", codigo, original);
        jdbc.update("DELETE FROM cuentas_puc WHERE codigo = ?", original);
        return cuenta(codigo);
    }

    /** Elimina una cuenta creada por error: solo si no tiene movimientos ni la usa SOGO. */
    @Transactional
    public void eliminarCuenta(String codigo) {
        if (!clasesDeCuentas().containsKey(codigo)) throw new ResponseStatusException(NOT_FOUND, "La cuenta " + codigo + " no existe");
        if (protegidas().contains(codigo)) throw new ResponseStatusException(CONFLICT, "SOGO usa la cuenta " + codigo + " para integrar los módulos: no se puede eliminar");
        Integer usos = jdbc.queryForObject("SELECT COUNT(*) FROM asiento_lineas WHERE cuenta_codigo = ?", Integer.class, codigo);
        if (usos != null && usos > 0) {
            throw new ResponseStatusException(CONFLICT, "La cuenta " + codigo + " tiene " + usos + " movimiento(s): no se puede eliminar. Desactívala o cámbiale el código");
        }
        jdbc.update("DELETE FROM cuentas_puc WHERE codigo = ?", codigo);
    }

    private ObjectNode cuenta(String codigo) {
        return cuentas().stream().filter(c -> c.path("code").asText().equals(codigo)).findFirst().orElseThrow();
    }

    /** En el PUC el primer dígito es la clase: 1 activo, 2 pasivo, 3 patrimonio, 4 ingreso, 5 gasto, 6 o 7 costo. */
    private static void validarClase(String codigo, String clase) {
        if (!CLASES.contains(clase)) throw new ResponseStatusException(BAD_REQUEST, "Clase de cuenta no válida");
        if ("Costo".equals(clase)) {
            if (!codigo.startsWith("6") && !codigo.startsWith("7")) throw new ResponseStatusException(BAD_REQUEST, "Las cuentas de costo empiezan por 6 o 7");
            return;
        }
        String digito = String.valueOf(CLASES.indexOf(clase) + 1);
        if (!codigo.startsWith(digito)) throw new ResponseStatusException(BAD_REQUEST, "Las cuentas de " + clase.toLowerCase() + " empiezan por " + digito + " en el PUC");
    }

    private void exigirSinMovimientosCerrados(String codigo, String accion) {
        YearMonth cierre = cerradoHasta();
        if (cierre == null) return;
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM asiento_lineas l JOIN asientos a ON a.id = l.asiento_id WHERE l.cuenta_codigo = ? AND a.fecha <= ?",
                Integer.class, codigo, Date.valueOf(cierre.atEndOfMonth()));
        if (n != null && n > 0) throw new ResponseStatusException(CONFLICT, "La cuenta " + codigo + " tiene movimientos en meses cerrados: no se puede " + accion);
    }

    // ── Asientos ─────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ObjectNode> asientos() {
        Map<Long, ArrayNode> lineas = new HashMap<>();
        jdbc.query("SELECT asiento_id, cuenta_codigo, detalle, tercero, tercero_documento, centro_costo, debito, credito FROM asiento_lineas ORDER BY id", rs -> {
            ObjectNode l = json.createObjectNode();
            l.put("account", rs.getString("cuenta_codigo"));
            l.put("detail", nz(rs.getString("detalle")));
            l.put("third", nz(rs.getString("tercero")));
            if (rs.getString("tercero_documento") != null) l.put("thirdDoc", rs.getString("tercero_documento"));
            if (rs.getString("centro_costo") != null) l.put("costCenter", rs.getString("centro_costo"));
            l.put("debit", rs.getBigDecimal("debito").doubleValue());
            l.put("credit", rs.getBigDecimal("credito").doubleValue());
            lineas.computeIfAbsent(rs.getLong("asiento_id"), k -> json.createArrayNode()).add(l);
        });
        // Soportes: referencias (solo el nombre, las pone la integración) y archivos guardados en la base
        Map<Long, ArrayNode> soportes = new HashMap<>(), archivos = new HashMap<>();
        jdbc.query("SELECT id, asiento_id, archivo, tipo_mime, tamano, subido_at, subido_por_nombre, contenido IS NOT NULL AS tiene FROM asiento_soportes ORDER BY id", rs -> {
            if (!rs.getBoolean("tiene")) { soportes.computeIfAbsent(rs.getLong("asiento_id"), k -> json.createArrayNode()).add(rs.getString("archivo")); return; }
            ObjectNode f = json.createObjectNode();
            f.put("id", String.valueOf(rs.getLong("id")));
            f.put("name", rs.getString("archivo"));
            f.put("type", nz(rs.getString("tipo_mime")));
            f.put("size", rs.getInt("tamano"));
            f.put("at", rs.getTimestamp("subido_at").toLocalDateTime().format(MINUTO));
            f.put("by", nz(rs.getString("subido_por_nombre")));
            archivos.computeIfAbsent(rs.getLong("asiento_id"), k -> json.createArrayNode()).add(f);
        });
        return jdbc.query("SELECT * FROM asientos ORDER BY fecha, hora, id", (rs, i) -> {
            long id = rs.getLong("id");
            ObjectNode o = json.createObjectNode();
            o.put("id", String.valueOf(id));
            o.put("number", rs.getString("numero"));
            o.put("kind", rs.getString("tipo"));
            o.put("date", rs.getDate("fecha").toLocalDate().toString());
            String hora = rs.getString("hora");
            o.put("time", hora == null ? "00:00" : hora.substring(0, 5));
            o.put("concept", rs.getString("concepto"));
            o.put("third", nz(rs.getString("tercero_nombre")));
            if (rs.getString("tercero_documento") != null) o.put("thirdDoc", rs.getString("tercero_documento"));
            if (rs.getString("factura_afecta") != null) o.put("invoiceRef", rs.getString("factura_afecta"));
            if (rs.getString("motivo_nota") != null) o.put("noteReason", rs.getString("motivo_nota"));
            if (rs.getString("categoria") != null) o.put("category", rs.getString("categoria"));
            if (rs.getString("metodo_pago") != null) o.put("method", rs.getString("metodo_pago"));
            o.put("origin", rs.getString("origen"));
            if (rs.getString("origen_clave") != null) o.put("sourceKey", rs.getString("origen_clave"));
            if (rs.getString("origen_ref") != null) o.put("sourceRef", rs.getString("origen_ref"));
            o.put("status", rs.getString("estado"));
            o.put("observations", nz(rs.getString("observaciones")));
            o.put("createdBy", rs.getString("usuario_nombre") == null ? "—" : rs.getString("usuario_nombre"));
            o.put("createdAt", rs.getTimestamp("creado_at").toLocalDateTime().format(MINUTO));
            if (rs.getTimestamp("anulado_at") != null) {
                ObjectNode an = o.putObject("annulment");
                an.put("at", rs.getTimestamp("anulado_at").toLocalDateTime().format(MINUTO));
                an.put("by", nz(rs.getString("anulado_por_nombre")));
                an.put("reason", nz(rs.getString("motivo_anulacion")));
            }
            o.set("lines", lineas.getOrDefault(id, json.createArrayNode()));
            o.set("supports", soportes.getOrDefault(id, json.createArrayNode()));
            o.set("files", archivos.getOrDefault(id, json.createArrayNode()));
            return o;
        });
    }

    /** Comprobante manual: lo valida y numera el servidor; queda en borrador o contabilizado. */
    public ObjectNode registrar(JsonNode b, Long uid, String nombre) {
        return tx.execute(s -> {
            String tipo = b.path("kind").asText("");
            if (!MANUALES.contains(tipo)) throw new ResponseStatusException(BAD_REQUEST, "Tipo de comprobante no válido");
            LocalDate fecha = fecha(b.path("date").asText(""));
            boolean borrador = b.path("draft").asBoolean(false);
            List<String> errores = validar(fecha, b.path("concept").asText(""), b.path("lines"), true);
            List<Archivo> adjuntos = new ArrayList<>();
            for (JsonNode f : b.path("files")) adjuntos.add(archivo(f));
            if (adjuntos.size() > MAX_ARCHIVOS) errores.add("máximo " + MAX_ARCHIVOS + " archivos por comprobante");
            if (!borrador && soportes(b).isEmpty() && adjuntos.isEmpty()) errores.add("falta el documento soporte");
            errores.addAll(validarDocumento(tipo, b, borrador));
            if (!errores.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "No se puede registrar: " + String.join(", ", errores));
            long id = insertar(b, tipo, fecha, "Manual", null, borrador ? "Borrador" : "Contabilizado", uid, nombre);
            for (Archivo f : adjuntos) guardarArchivo(id, f, nombre);
            return buscar(id);
        });
    }

    /** Un borrador manual pasa a contabilizado (con las mismas validaciones y su soporte). */
    public ObjectNode contabilizar(long id) {
        return tx.execute(s -> {
            ObjectNode a = buscar(id);
            if (!"Borrador".equals(a.path("status").asText())) throw new ResponseStatusException(CONFLICT, "Solo un borrador se puede contabilizar");
            List<String> errores = validar(LocalDate.parse(a.path("date").asText()), a.path("concept").asText(), a.path("lines"), true);
            if (a.path("supports").isEmpty() && a.path("files").isEmpty()) errores.add("falta el documento soporte");
            errores.addAll(validarDocumento(a.path("kind").asText(), a, false));
            if (!errores.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "No se puede contabilizar: " + String.join(", ", errores));
            jdbc.update("UPDATE asientos SET estado = 'Contabilizado', actualizado_at = NOW() WHERE id = ?", id);
            return buscar(id);
        });
    }

    /** Anula un comprobante manual (los integrados se anulan en su módulo de origen). */
    public ObjectNode anular(long id, String motivo, Long uid, String nombre) {
        return tx.execute(s -> {
            ObjectNode a = buscar(id);
            if (!"Manual".equals(a.path("origin").asText())) throw new ResponseStatusException(CONFLICT, "Los comprobantes integrados se anulan en su módulo de origen");
            if ("Anulado".equals(a.path("status").asText())) throw new ResponseStatusException(CONFLICT, "El comprobante ya está anulado");
            if (cerrado(LocalDate.parse(a.path("date").asText()), cerradoHasta())) throw new ResponseStatusException(CONFLICT, "El mes del comprobante está cerrado");
            String m = motivo == null ? "" : motivo.trim();
            if (m.length() < 5) throw new ResponseStatusException(BAD_REQUEST, "Indica el motivo de la anulación");
            jdbc.update("UPDATE asientos SET estado = 'Anulado', anulado_at = NOW(), anulado_por = ?, anulado_por_nombre = ?, motivo_anulacion = ?, actualizado_at = NOW() WHERE id = ?",
                    uid, nombre, corto(m, 255), id);
            return buscar(id);
        });
    }

    private ObjectNode buscar(long id) {
        return asientos().stream().filter(a -> a.path("id").asText().equals(String.valueOf(id))).findFirst()
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "El comprobante no existe"));
    }

    // ── Integración ──────────────────────────────────────

    /**
     * Recibe los asientos calculados de los módulos (cada uno con su `sourceKey`) y deja la base
     * igual: crea los nuevos (numerados en orden de fecha), actualiza los que cambiaron (conservan
     * su número) y anula los que ya no existen en su origen. Los meses cerrados no se tocan.
     */
    public synchronized ObjectNode integrar(JsonNode body, Long uid, String nombre) {
        return tx.execute(s -> {
            String modo = "Manual".equals(body.path("mode").asText()) ? "Manual" : "Automática";
            YearMonth cierre = cerradoHasta();
            Map<String, String> clases = clasesDeCuentas();
            Map<String, ObjectNode> previos = new HashMap<>();
            asientos().stream().filter(a -> a.has("sourceKey")).forEach(a -> previos.put(a.path("sourceKey").asText(), a));

            List<JsonNode> entrada = new ArrayList<>();
            body.path("entries").forEach(entrada::add);
            entrada.sort(Comparator.comparing(e -> e.path("date").asText() + e.path("time").asText()));

            int creados = 0, actualizados = 0, anulados = 0, omitidos = 0;
            List<String> errores = new ArrayList<>();
            Set<String> vistas = new HashSet<>();
            for (JsonNode e : entrada) {
                String clave = e.path("sourceKey").asText("");
                if (clave.isEmpty() || clave.length() > 80 || !vistas.add(clave)) continue;
                String origen = e.path("origin").asText("");
                String tipo = e.path("kind").asText("");
                String estado = e.path("status").asText("Contabilizado");
                LocalDate fecha;
                try { fecha = LocalDate.parse(e.path("date").asText("")); } catch (Exception x) { errores.add(clave + ": fecha no válida"); continue; }
                if (!MODULOS.contains(origen) || !PREFIJOS.containsKey(tipo) || !ESTADOS_INTEGRADOS.contains(estado)) { errores.add(clave + ": datos no válidos"); continue; }
                List<String> mal = validarLineas(e.path("lines"), clases, false);
                if (!mal.isEmpty()) { errores.add(clave + ": " + String.join(", ", mal)); continue; }

                ObjectNode previo = previos.get(clave);
                boolean enCierre = cerrado(fecha, cierre) || (previo != null && cerrado(LocalDate.parse(previo.path("date").asText()), cierre));
                if (previo == null) {
                    if ("Anulado".equals(estado)) continue;
                    if (enCierre) { omitidos++; continue; }
                    insertar(e, tipo, fecha, origen, clave, estado, null, "Integración automática");
                    creados++;
                } else if (!firma(previo).equals(firma(e))) {
                    if (enCierre) { omitidos++; continue; }
                    long id = previo.path("id").asLong();
                    jdbc.update("UPDATE asientos SET tipo = ?, fecha = ?, hora = ?, concepto = ?, tercero_nombre = ?, tercero_documento = ?, categoria = ?, metodo_pago = ?, origen = ?, "
                                    + "origen_ref = ?, estado = ?, actualizado_at = NOW() WHERE id = ?",
                            tipo, Date.valueOf(fecha), hora(e), corto(e.path("concept").asText(""), 255), corto(e.path("third").asText(""), 200), texto(e, "thirdDoc", 30),
                            texto(e, "category", 60), texto(e, "method", 30), origen, texto(e, "sourceRef", 40), estado, id);
                    if ("Anulado".equals(estado) && !"Anulado".equals(previo.path("status").asText())) {
                        jdbc.update("UPDATE asientos SET anulado_at = NOW(), anulado_por_nombre = 'Integración', motivo_anulacion = 'Anulado en el módulo de origen' WHERE id = ?", id);
                    } else if (!"Anulado".equals(estado)) {
                        jdbc.update("UPDATE asientos SET anulado_at = NULL, anulado_por = NULL, anulado_por_nombre = NULL, motivo_anulacion = NULL WHERE id = ?", id);
                    }
                    jdbc.update("DELETE FROM asiento_lineas WHERE asiento_id = ?", id);
                    // Las referencias se rehacen; los archivos que subió el usuario se conservan
                    jdbc.update("DELETE FROM asiento_soportes WHERE asiento_id = ? AND contenido IS NULL", id);
                    insertarLineas(id, e);
                    actualizados++;
                }
            }
            // Lo que ya no existe en su módulo se anula (se conserva con su número)
            for (ObjectNode p : previos.values()) {
                if (vistas.contains(p.path("sourceKey").asText()) || "Anulado".equals(p.path("status").asText())) continue;
                if (cerrado(LocalDate.parse(p.path("date").asText()), cierre)) { omitidos++; continue; }
                jdbc.update("UPDATE asientos SET estado = 'Anulado', anulado_at = NOW(), anulado_por_nombre = 'Integración', "
                        + "motivo_anulacion = 'El registro de origen ya no existe', actualizado_at = NOW() WHERE id = ?", p.path("id").asLong());
                anulados++;
            }

            Integer vigentes = jdbc.queryForObject("SELECT COUNT(*) FROM asientos WHERE origen_clave IS NOT NULL AND estado <> 'Anulado'", Integer.class);
            ObjectNode r = json.createObjectNode();
            r.put("mode", modo);
            r.put("created", creados);
            r.put("updated", actualizados);
            r.put("annulled", anulados);
            r.put("omitted", omitidos);
            r.put("integrated", vigentes == null ? 0 : vigentes);
            r.put("review", body.path("review").asInt(0));
            r.put("modules", body.path("modules").asInt(MODULOS.size()));
            ArrayNode err = r.putArray("errors");
            errores.forEach(err::add);
            if ("Manual".equals(modo) || creados + actualizados + anulados > 0) {
                jdbc.update("INSERT INTO contabilidad_eventos (tipo, modo, usuario_id, usuario_nombre, detalle) VALUES ('Integración', ?, ?, ?, ?)",
                        modo, uid, "Manual".equals(modo) ? nombre : "Sistema", r.toString());
            }
            return r;
        });
    }

    /** Lo que define un asiento integrado (para saber si cambió en su origen). */
    private static String firma(JsonNode a) {
        StringBuilder sb = new StringBuilder();
        for (String k : List.of("kind", "date", "time", "concept", "third", "thirdDoc", "category", "method", "origin", "sourceRef", "status")) {
            sb.append(a.path(k).asText("")).append('|');
        }
        for (JsonNode l : a.path("lines")) {
            sb.append(l.path("account").asText()).append(';').append(l.path("detail").asText("")).append(';').append(l.path("third").asText(""))
                    .append(';').append(l.path("costCenter").asText(""))
                    .append(';').append(Math.round(l.path("debit").asDouble())).append(';').append(Math.round(l.path("credit").asDouble())).append('|');
        }
        for (JsonNode x : a.path("supports")) sb.append(x.asText()).append(',');
        return sb.toString();
    }

    // ── Historial ────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ObjectNode> eventos() {
        return jdbc.query("SELECT * FROM contabilidad_eventos ORDER BY id DESC LIMIT 300", (rs, i) -> {
            ObjectNode o = json.createObjectNode();
            o.put("type", rs.getString("tipo"));
            if (rs.getString("modo") != null) o.put("mode", rs.getString("modo"));
            o.put("at", rs.getTimestamp("creado_at").toLocalDateTime().format(MINUTO));
            o.put("user", nz(rs.getString("usuario_nombre")));
            try { o.set("detail", json.readTree(rs.getString("detalle"))); } catch (Exception e) { o.putObject("detail"); }
            return o;
        });
    }

    @Transactional
    public void exportacion(JsonNode b, Long uid, String nombre) {
        ObjectNode d = json.createObjectNode();
        d.put("file", corto(b.path("file").asText(""), 120));
        d.put("period", corto(b.path("period").asText(""), 80));
        jdbc.update("INSERT INTO contabilidad_eventos (tipo, usuario_id, usuario_nombre, detalle) VALUES ('Exportación', ?, ?, ?)", uid, nombre, d.toString());
    }

    // ── Centros de costo ─────────────────────────────────

    @Transactional(readOnly = true)
    public List<ObjectNode> centros() {
        return jdbc.query("SELECT codigo, nombre, activo FROM centros_costo ORDER BY codigo", (rs, i) -> {
            ObjectNode o = json.createObjectNode();
            o.put("code", rs.getString("codigo"));
            o.put("name", rs.getString("nombre"));
            o.put("active", rs.getBoolean("activo"));
            return o;
        });
    }

    /** Crea o cambia un centro de costo (CC-04...). No se eliminan: se desactivan. */
    @Transactional
    public List<ObjectNode> guardarCentro(JsonNode b) {
        String codigo = b.path("code").asText("").trim().toUpperCase();
        String nombre = corto(b.path("name").asText("").trim(), 80);
        if (!codigo.matches("CC-[0-9]{2,3}")) throw new ResponseStatusException(BAD_REQUEST, "El código del centro de costo va como CC-04");
        if (nombre.length() < 3) throw new ResponseStatusException(BAD_REQUEST, "Escribe el nombre del centro de costo");
        jdbc.update("INSERT INTO centros_costo (codigo, nombre, activo) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), activo = VALUES(activo)",
                codigo, nombre, b.path("active").asBoolean(true));
        return centros();
    }

    private Set<String> centrosActivos() {
        return new HashSet<>(jdbc.queryForList("SELECT codigo FROM centros_costo WHERE activo = 1", String.class));
    }

    /**
     * Lo que exige el formato del contador en un comprobante manual: centro de costo en cada línea,
     * el tercero con su identificación (recibo de caja, egreso y notas crédito/débito) y, en las
     * notas crédito y débito, la factura que afectan y el motivo.
     */
    private List<String> validarDocumento(String tipo, JsonNode b, boolean borrador) {
        List<String> e = new ArrayList<>();
        if (borrador) return e;
        Set<String> centros = centrosActivos();
        for (JsonNode l : b.path("lines")) {
            String cc = l.path("costCenter").asText("");
            if (cc.isEmpty()) { e.add("falta el centro de costo en alguna línea"); break; }
            if (!centros.contains(cc)) { e.add("el centro de costo " + cc + " no existe o está inactivo"); break; }
        }
        boolean conTercero = List.of("Ingreso", "Cobro", "Egreso", "Pago", "Nota crédito", "Nota débito").contains(tipo);
        if (conTercero && b.path("third").asText("").isBlank()) e.add("falta el tercero (" + ("Egreso".equals(tipo) || "Pago".equals(tipo) ? "pagado a" : "recibido de / cliente") + ")");
        if (conTercero && b.path("thirdDoc").asText("").isBlank()) e.add("falta la identificación del tercero (NIT o CC)");
        if (CIERRE.equals(b.path("category").asText(""))) {
            String f = b.path("date").asText("");
            if (!f.endsWith("-12-31")) e.add("el cierre del ejercicio va con fecha 31 de diciembre");
            Integer otros = jdbc.queryForObject("SELECT COUNT(*) FROM asientos WHERE categoria = ? AND estado <> 'Anulado' AND YEAR(fecha) = ? AND id <> ?",
                    Integer.class, CIERRE, f.length() >= 4 ? f.substring(0, 4) : "0", b.path("id").asLong(-1));
            if (otros != null && otros > 0) e.add("el ejercicio " + f.substring(0, Math.min(4, f.length())) + " ya tiene comprobante de cierre (anúlalo para rehacerlo)");
        }
        if (tipo.startsWith("Nota ")) {
            if (b.path("invoiceRef").asText("").isBlank()) e.add("falta la factura que afecta la nota");
            String m = b.path("noteReason").asText("");
            if (!MOTIVOS_NOTA.contains(m)) e.add("falta el motivo de la nota");
        }
        return e;
    }

    // ── Validación e inserción ───────────────────────────

    private LocalDate fecha(String s) {
        try { return LocalDate.parse(s); } catch (Exception e) { throw new ResponseStatusException(BAD_REQUEST, "Falta la fecha"); }
    }

    /** Período abierto (desde el inicio, fuera de meses cerrados, hasta fin del mes actual) y partida doble. */
    private List<String> validar(LocalDate fecha, String concepto, JsonNode lineas, boolean manual) {
        List<String> e = new ArrayList<>();
        LocalDate inicio = inicio();
        if (fecha.isBefore(inicio)) e.add("la fecha es anterior al inicio de la contabilidad en SOGO (" + inicio + ")");
        if (fecha.isAfter(YearMonth.now().atEndOfMonth())) e.add("la fecha es posterior al mes actual");
        if (cerrado(fecha, cerradoHasta())) e.add("el mes " + YearMonth.from(fecha) + " está cerrado (cerrados hasta " + cerradoHasta()
                + "; se reabre en Contabilidad › Integración › Meses cerrados hasta)");
        if (concepto == null || concepto.isBlank()) e.add("falta el concepto");
        e.addAll(validarLineas(lineas, clasesDeCuentas(), manual));
        return e;
    }

    private List<String> validarLineas(JsonNode lineas, Map<String, String> clases, boolean soloActivas) {
        List<String> e = new ArrayList<>();
        if (!lineas.isArray() || lineas.size() < 2) { e.add("se necesitan al menos dos partidas"); return e; }
        Set<String> activas = new HashSet<>();
        if (soloActivas) jdbc.query("SELECT codigo FROM cuentas_puc WHERE activa = 1", rs -> { activas.add(rs.getString(1)); });
        BigDecimal d = BigDecimal.ZERO, c = BigDecimal.ZERO;
        for (JsonNode l : lineas) {
            String cuenta = l.path("account").asText("");
            double deb = l.path("debit").asDouble(0), cre = l.path("credit").asDouble(0);
            if (!clases.containsKey(cuenta)) { e.add(cuenta.isEmpty() ? "hay partidas sin cuenta" : "la cuenta " + cuenta + " no existe en el plan de cuentas"); continue; }
            if (soloActivas && !activas.contains(cuenta)) e.add("la cuenta " + cuenta + " está inactiva");
            if (deb < 0 || cre < 0) e.add("no se permiten valores negativos");
            if ((deb > 0) == (cre > 0)) e.add("cada partida lleva valor solo en débito o solo en crédito");
            d = d.add(BigDecimal.valueOf(deb));
            c = c.add(BigDecimal.valueOf(cre));
        }
        if (d.signum() <= 0 || d.setScale(0, RoundingMode.HALF_UP).compareTo(c.setScale(0, RoundingMode.HALF_UP)) != 0) e.add("débitos y créditos no suman igual");
        return new ArrayList<>(new LinkedHashSet<>(e));
    }

    private long insertar(JsonNode b, String tipo, LocalDate fecha, String origen, String clave, String estado, Long uid, String nombre) {
        String numero = siguienteNumero(PREFIJOS.get(tipo), fecha.getYear());
        GeneratedKeyHolder llave = new GeneratedKeyHolder();
        jdbc.update(c -> {
            PreparedStatement ps = c.prepareStatement("INSERT INTO asientos (numero, tipo, fecha, hora, concepto, tercero_nombre, categoria, metodo_pago, origen, "
                    + "origen_clave, origen_ref, estado, observaciones, creado_por, usuario_nombre, tercero_documento, factura_afecta, motivo_nota) "
                    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, numero);
            ps.setString(2, tipo);
            ps.setDate(3, Date.valueOf(fecha));
            ps.setTime(4, hora(b));
            ps.setString(5, corto(b.path("concept").asText("").trim(), 255));
            ps.setString(6, corto(b.path("third").asText("").trim(), 200));
            ps.setString(7, texto(b, "category", 60));
            ps.setString(8, texto(b, "method", 30));
            ps.setString(9, origen);
            ps.setString(10, clave);
            ps.setString(11, texto(b, "sourceRef", 40));
            ps.setString(12, estado);
            ps.setString(13, texto(b, "observations", 500));
            ps.setObject(14, uid);
            ps.setString(15, nombre);
            ps.setString(16, texto(b, "thirdDoc", 30));
            ps.setString(17, texto(b, "invoiceRef", 40));
            ps.setString(18, texto(b, "noteReason", 30));
            return ps;
        }, llave);
        long id = Objects.requireNonNull(llave.getKey()).longValue();
        insertarLineas(id, b);
        return id;
    }

    private void insertarLineas(long id, JsonNode b) {
        for (JsonNode l : b.path("lines")) {
            jdbc.update("INSERT INTO asiento_lineas (asiento_id, cuenta_codigo, detalle, tercero, tercero_documento, centro_costo, debito, credito) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    id, l.path("account").asText(), corto(l.path("detail").asText(""), 255), corto(l.path("third").asText(""), 200),
                    texto(l, "thirdDoc", 30), texto(l, "costCenter", 10),
                    BigDecimal.valueOf(Math.round(l.path("debit").asDouble(0))), BigDecimal.valueOf(Math.round(l.path("credit").asDouble(0))));
        }
        for (String s : soportes(b)) jdbc.update("INSERT INTO asiento_soportes (asiento_id, archivo) VALUES (?, ?)", id, s);
    }

    // ── Archivos de soporte (guardados en la base de datos) ──

    private static final int MAX_BYTES = 5 * 1024 * 1024, MAX_ARCHIVOS = 5;
    private static final Map<String, String> TIPOS = Map.of("application/pdf", "PDF", "image/jpeg", "JPG", "image/png", "PNG", "image/webp", "WEBP");

    /** Archivo de soporte: nombre, tipo y contenido. Llega en base64: { name, type, data }. */
    public record Archivo(String nombre, String tipo, byte[] datos) {}

    private static Archivo archivo(JsonNode f) {
        String nombre = f.path("name").asText("").trim().replaceAll("[\\\\/:*?\"<>|]", "_");
        String tipo = f.path("type").asText("");
        if (nombre.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "El archivo de soporte no tiene nombre");
        if (!TIPOS.containsKey(tipo)) throw new ResponseStatusException(BAD_REQUEST, "El soporte «" + nombre + "» debe ser PDF, JPG, PNG o WEBP");
        byte[] datos;
        try { datos = Base64.getDecoder().decode(f.path("data").asText("")); }
        catch (IllegalArgumentException e) { throw new ResponseStatusException(BAD_REQUEST, "El soporte «" + nombre + "» llegó dañado"); }
        if (datos.length == 0) throw new ResponseStatusException(BAD_REQUEST, "El soporte «" + nombre + "» está vacío");
        if (datos.length > MAX_BYTES) throw new ResponseStatusException(BAD_REQUEST, "El soporte «" + nombre + "» pesa más de 5 MB");
        if (!firmaValida(tipo, datos)) throw new ResponseStatusException(BAD_REQUEST, "El contenido de «" + nombre + "» no es un " + TIPOS.get(tipo) + " válido");
        return new Archivo(corto(nombre, 255), tipo, datos);
    }

    /** Revisa los primeros bytes: que un .pdf sea de verdad un PDF, una foto JPG sea JPG, etc. */
    private static boolean firmaValida(String tipo, byte[] d) {
        return switch (tipo) {
            case "application/pdf" -> d.length > 4 && d[0] == '%' && d[1] == 'P' && d[2] == 'D' && d[3] == 'F';
            case "image/jpeg" -> d.length > 2 && (d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8;
            case "image/png" -> d.length > 8 && (d[0] & 0xFF) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G';
            case "image/webp" -> d.length > 12 && d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F' && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P';
            default -> false;
        };
    }

    private void guardarArchivo(long asiento, Archivo f, String nombre) {
        jdbc.update("INSERT INTO asiento_soportes (asiento_id, archivo, tipo_mime, tamano, contenido, subido_por_nombre) VALUES (?, ?, ?, ?, ?, ?)",
                asiento, f.nombre(), f.tipo(), f.datos().length, f.datos(), corto(nombre, 120));
    }

    /** Agrega un archivo a un comprobante existente (también a los integrados). No a uno anulado. */
    public ObjectNode agregarSoporte(long id, JsonNode body, String nombre) {
        return tx.execute(s -> {
            ObjectNode a = buscar(id);
            if ("Anulado".equals(a.path("status").asText())) throw new ResponseStatusException(CONFLICT, "El comprobante está anulado");
            if (a.path("files").size() >= MAX_ARCHIVOS) throw new ResponseStatusException(BAD_REQUEST, "Máximo " + MAX_ARCHIVOS + " archivos por comprobante");
            guardarArchivo(id, archivo(body), nombre);
            return buscar(id);
        });
    }

    /** El archivo para verlo o descargarlo. */
    public Archivo leerSoporte(long id, long soporte) {
        List<Archivo> r = jdbc.query("SELECT archivo, tipo_mime, contenido FROM asiento_soportes WHERE id = ? AND asiento_id = ? AND contenido IS NOT NULL",
                (rs, i) -> new Archivo(rs.getString(1), rs.getString(2), rs.getBytes(3)), soporte, id);
        if (r.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "El archivo no existe");
        return r.get(0);
    }

    /** Quita un archivo: de un borrador siempre; de uno contabilizado solo si le queda otro soporte. */
    public ObjectNode quitarSoporte(long id, long soporte) {
        return tx.execute(s -> {
            ObjectNode a = buscar(id);
            if ("Anulado".equals(a.path("status").asText())) throw new ResponseStatusException(CONFLICT, "El comprobante está anulado");
            boolean borrador = "Borrador".equals(a.path("status").asText());
            if (!borrador && a.path("files").size() + a.path("supports").size() <= 1)
                throw new ResponseStatusException(CONFLICT, "Un comprobante contabilizado debe conservar al menos un soporte: agrega el nuevo antes de quitar este");
            if (jdbc.update("DELETE FROM asiento_soportes WHERE id = ? AND asiento_id = ? AND contenido IS NOT NULL", soporte, id) == 0)
                throw new ResponseStatusException(NOT_FOUND, "El archivo no existe");
            return buscar(id);
        });
    }

    private static List<String> soportes(JsonNode b) {
        List<String> s = new ArrayList<>();
        b.path("supports").forEach(x -> { if (!x.asText("").isBlank()) s.add(corto(x.asText().trim(), 255)); });
        return s;
    }

    /**
     * Consecutivo por tipo y año con el formato del contador: RC-2026001, NCO-2026012... El contador
     * es propio de cada tipo (clave «C:» + prefijo en `consecutivos`), así las notas crédito (NC)
     * no siguen la numeración que tenían antes las notas de contabilidad.
     */
    private String siguienteNumero(String prefijo, int anio) {
        String clave = "C:" + prefijo;
        jdbc.update("INSERT IGNORE INTO consecutivos (prefijo, anio, ultimo) VALUES (?, ?, 0)", clave, anio);
        jdbc.update("UPDATE consecutivos SET ultimo = ultimo + 1 WHERE prefijo = ? AND anio = ?", clave, anio);
        Integer n = jdbc.queryForObject("SELECT ultimo FROM consecutivos WHERE prefijo = ? AND anio = ?", Integer.class, clave, anio);
        return String.format("%s-%d%03d", prefijo, anio, n);
    }

    private static Time hora(JsonNode b) {
        String h = b.path("time").asText("");
        try { return Time.valueOf(LocalTime.parse(h.length() >= 5 ? h.substring(0, 5) : "00:00")); } catch (Exception e) { return Time.valueOf(LocalTime.MIDNIGHT); }
    }

    private static String texto(JsonNode b, String campo, int max) {
        String v = b.path(campo).asText("").trim();
        return v.isEmpty() ? null : corto(v, max);
    }

    private static String corto(String s, int max) { return s == null ? null : s.length() > max ? s.substring(0, max) : s; }

    private static String nz(String s) { return s == null ? "" : s; }
}
