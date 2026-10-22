package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

import static org.springframework.http.HttpStatus.*;

/**
 * Inventarios (tablas categorias_inventario, productos_inventario, movimientos_inventario,
 * movimiento_inventario_lineas, alertas_inventario y terceros como proveedores), con la forma
 * de inventory.model.ts del frontend.
 *
 * Las existencias SOLO cambian con movimientos (inicial, entrada, salida, ajuste), que calcula
 * el servidor: cantidad antes y después, costo promedio ponderado y consecutivo ENT/SAL/AJU/INI.
 * Las categorías en pausa (Alimentos y Bebidas por ahora) no reciben productos ni entradas.
 */
@Service
public class InventarioService {

    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    private static final List<String> FRACCIONABLES = List.of("kg", "litro", "galón");
    private static final Map<String, String> PREFIJOS = Map.of("Inicial", "INI", "Entrada", "ENT", "Salida", "SAL", "Ajuste", "AJU");
    private static final List<String> MOTIVOS_ENTRADA = List.of("Compra", "Devolución", "Reposición", "Donación", "Ajuste positivo");
    private static final List<String> MOTIVOS_SALIDA = List.of("Consumo interno", "Uso en habitaciones", "Daño", "Pérdida", "Vencimiento", "Transferencia", "Baja");
    private static final List<String> MOTIVOS_AJUSTE = List.of("Inventario físico", "Pérdida", "Deterioro", "Error de registro", "Otro autorizado");

    private final JdbcTemplate jdbc;
    private final ConfiguracionService config;
    private final ObjectMapper json;

    public InventarioService(JdbcTemplate jdbc, ConfiguracionService config, ObjectMapper json) {
        this.jdbc = jdbc;
        this.config = config;
        this.json = json;
    }

    // ── Categorías ───────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ObjectNode> categorias() {
        return jdbc.query("SELECT c.id, c.nombre, c.prefijo, c.en_uso, (SELECT COUNT(*) FROM productos_inventario p WHERE p.categoria_id = c.id) n "
                + "FROM categorias_inventario c ORDER BY c.en_uso DESC, c.nombre", (rs, i) -> {
            ObjectNode o = json.createObjectNode();
            o.put("id", rs.getLong("id"));
            o.put("name", rs.getString("nombre"));
            o.put("prefix", rs.getString("prefijo"));
            o.put("inUse", rs.getBoolean("en_uso"));
            o.put("products", rs.getInt("n"));
            return o;
        });
    }

    @Transactional
    public ObjectNode crearCategoria(String nombre) {
        String limpio = nombre == null ? "" : nombre.trim();
        if (limpio.length() < 3) throw new ResponseStatusException(BAD_REQUEST, "Escribe el nombre de la categoría");
        Integer existe = jdbc.queryForObject("SELECT COUNT(*) FROM categorias_inventario WHERE nombre = ?", Integer.class, limpio);
        if (existe != null && existe > 0) throw new ResponseStatusException(CONFLICT, "La categoría " + limpio + " ya existe");
        String base = java.text.Normalizer.normalize(limpio, java.text.Normalizer.Form.NFD).replaceAll("[^A-Za-z]", "").toUpperCase() + "XXX";
        String prefijo = base.substring(0, 3);
        for (int i = 3; usado(prefijo) && i < base.length(); i++) prefijo = base.substring(0, 2) + base.charAt(i);
        if (usado(prefijo)) throw new ResponseStatusException(CONFLICT, "No se pudo asignar un prefijo único a la categoría");
        jdbc.update("INSERT INTO categorias_inventario (nombre, prefijo, en_uso) VALUES (?, ?, 1)", limpio, prefijo);
        return categorias().stream().filter(c -> limpio.equals(c.path("name").asText())).findFirst().orElseThrow();
    }

    private boolean usado(String prefijo) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM categorias_inventario WHERE prefijo = ?", Integer.class, prefijo);
        return n != null && n > 0;
    }

    /** Poner una categoría en pausa (no se usa por ahora) o volver a usarla. */
    @Transactional
    public void usarCategoria(long id, boolean enUso, String actor) {
        int n = jdbc.update("UPDATE categorias_inventario SET en_uso = ? WHERE id = ?", enUso, id);
        if (n == 0) throw new ResponseStatusException(NOT_FOUND, "No existe la categoría");
        sincronizarAlertas(null, null);
    }

    // ── Proveedores (terceros) ───────────────────────────

    @Transactional(readOnly = true)
    public List<ObjectNode> proveedores() {
        return jdbc.query("SELECT id, nombre, tipo_documento, numero_documento, telefono FROM terceros WHERE es_proveedor = 1 AND activo = 1 ORDER BY nombre",
                (rs, i) -> {
                    ObjectNode o = json.createObjectNode();
                    o.put("id", rs.getLong("id"));
                    o.put("name", rs.getString("nombre"));
                    o.put("docType", rs.getString("tipo_documento"));
                    o.put("docNumber", rs.getString("numero_documento"));
                    o.put("phone", texto(rs.getString("telefono")));
                    return o;
                });
    }

    /** Proveedor nuevo (o el que ya existe con ese documento queda marcado como proveedor). */
    @Transactional
    public ObjectNode crearProveedor(JsonNode d) {
        String nombre = d.path("name").asText("").trim();
        String tipo = d.path("docType").asText("NIT").trim().toUpperCase();
        String numero = d.path("docNumber").asText("").replaceAll("[^0-9]", "");
        if (nombre.length() < 3) throw new ResponseStatusException(BAD_REQUEST, "Escribe el nombre o razón social del proveedor");
        if (!List.of("NIT", "CC", "CE").contains(tipo)) throw new ResponseStatusException(BAD_REQUEST, "Tipo de documento no válido");
        if (numero.length() < 5 || numero.length() > 15) throw new ResponseStatusException(BAD_REQUEST, "Escribe el NIT o documento del proveedor (sin dígito de verificación)");
        List<Long> existe = jdbc.queryForList("SELECT id FROM terceros WHERE tipo_documento = ? AND numero_documento = ?", Long.class, tipo, numero);
        if (!existe.isEmpty()) {
            jdbc.update("UPDATE terceros SET es_proveedor = 1, activo = 1 WHERE id = ?", existe.get(0));
        } else {
            jdbc.update("INSERT INTO terceros (tipo_persona, tipo_documento, numero_documento, nombre, telefono, ciudad, es_proveedor) VALUES (?, ?, ?, ?, ?, ?, 1)",
                    "NIT".equals(tipo) ? "Jurídica" : "Natural", tipo, numero, nombre, d.path("phone").asText("").trim(), d.path("city").asText("Filandia"));
        }
        return proveedores().stream().filter(p -> numero.equals(p.path("docNumber").asText())).findFirst().orElseThrow();
    }

    // ── Productos ────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ObjectNode> productos() {
        return jdbc.query("SELECT p.*, c.nombre categoria, c.en_uso, t.nombre proveedor, "
                + "(SELECT COUNT(*) FROM movimiento_inventario_lineas l WHERE l.producto_id = p.id) movs "
                + "FROM productos_inventario p JOIN categorias_inventario c ON c.id = p.categoria_id "
                + "LEFT JOIN terceros t ON t.id = p.proveedor_id WHERE p.activo = 1 ORDER BY p.codigo", (rs, i) -> producto(rs));
    }

    private ObjectNode producto(ResultSet rs) throws SQLException {
        ObjectNode o = json.createObjectNode();
        o.put("id", String.valueOf(rs.getLong("id")));
        o.put("code", rs.getString("codigo"));
        o.put("name", rs.getString("nombre"));
        o.put("category", rs.getString("categoria"));
        o.put("categoryInUse", rs.getBoolean("en_uso"));
        o.put("description", texto(rs.getString("descripcion")));
        o.put("unit", rs.getString("unidad"));
        o.put("stock", rs.getBigDecimal("existencias").doubleValue());
        o.put("minStock", rs.getBigDecimal("stock_minimo").doubleValue());
        o.put("location", texto(rs.getString("ubicacion")));
        long prov = rs.getLong("proveedor_id");
        if (rs.wasNull()) o.putNull("supplierId"); else o.put("supplierId", prov);
        o.put("supplier", texto(rs.getString("proveedor")));
        o.put("unitCost", rs.getBigDecimal("costo_unitario").longValue());
        BigDecimal ref = rs.getBigDecimal("precio_referencia");
        if (ref == null) o.putNull("refPrice"); else o.put("refPrice", ref.longValue());
        o.put("tracksExpiry", rs.getBoolean("controla_vencimiento"));
        o.put("expiryDate", rs.getDate("fecha_vencimiento") == null ? "" : rs.getDate("fecha_vencimiento").toLocalDate().toString());
        o.put("createdAt", rs.getTimestamp("fecha_creacion").toLocalDateTime().format(MINUTO));
        o.put("counted", rs.getInt("movs") > 0);
        o.set("history", leerArreglo(rs.getString("historial")));
        return o;
    }

    /** body: { product: Product, initialQty } — la cantidad inicial queda como movimiento INI. */
    @Transactional
    public ObjectNode crearProducto(JsonNode body, long usuarioId, String actor) {
        JsonNode d = body.path("product");
        long categoria = categoriaEnUso(d.path("category").asText(""));
        String codigo = d.path("code").asText("").trim().toUpperCase();
        if (!codigo.matches("[A-Z]{2,5}-\\d{3,}")) throw new ResponseStatusException(BAD_REQUEST, "Código no válido (ej. ASE-007)");
        validarProducto(d, null);
        ArrayNode historial = json.createArrayNode();
        historial.addObject().put("at", LocalDateTime.now().format(MINUTO)).put("by", actor).put("text", "Producto registrado");
        GeneratedKeyHolder llave = new GeneratedKeyHolder();
        try {
            jdbc.update(c -> {
                PreparedStatement ps = c.prepareStatement("INSERT INTO productos_inventario (codigo, nombre, categoria_id, descripcion, unidad, existencias, "
                        + "stock_minimo, ubicacion, proveedor_id, costo_unitario, precio_referencia, controla_vencimiento, fecha_vencimiento, historial) "
                        + "VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)", Statement.RETURN_GENERATED_KEYS);
                ps.setString(1, codigo);
                ps.setString(2, d.path("name").asText().trim());
                ps.setLong(3, categoria);
                ps.setString(4, d.path("description").asText("").trim());
                ps.setString(5, d.path("unit").asText());
                ps.setBigDecimal(6, BigDecimal.valueOf(d.path("minStock").asDouble(0)));
                ps.setString(7, d.path("location").asText("").trim());
                ps.setObject(8, d.hasNonNull("supplierId") ? d.path("supplierId").asLong() : null);
                ps.setBigDecimal(9, BigDecimal.valueOf(d.path("unitCost").asDouble(0)));
                ps.setObject(10, d.hasNonNull("refPrice") ? BigDecimal.valueOf(d.path("refPrice").asDouble()) : null);
                ps.setBoolean(11, d.path("tracksExpiry").asBoolean(false));
                ps.setObject(12, fecha(d.path("expiryDate").asText("")));
                ps.setString(13, historial.toString());
                return ps;
            }, llave);
        } catch (DuplicateKeyException e) {
            throw new ResponseStatusException(CONFLICT, "El código " + codigo + " ya existe");
        }
        long id = Objects.requireNonNull(llave.getKey()).longValue();
        double inicial = body.path("initialQty").asDouble(0);
        ObjectNode r = json.createObjectNode();
        if (inicial > 0) {
            ObjectNode mov = json.createObjectNode();
            mov.put("kind", "Inicial").put("reason", "Existencias iniciales").put("date", LocalDate.now().toString())
                    .put("observations", "Cantidad inicial al registrar el producto");
            mov.putArray("lines").addObject().put("productId", String.valueOf(id)).put("qty", inicial).put("unitCost", d.path("unitCost").asDouble(0));
            r.set("movement", registrar(mov, usuarioId, actor));
        } else {
            sincronizarAlertas(null, usuarioId);
        }
        r.set("product", productos().stream().filter(p -> String.valueOf(id).equals(p.path("id").asText())).findFirst().orElseThrow());
        return r;
    }

    /** body: { product: cambios, summary: [textos para el historial] } — nunca cambia existencias. */
    @Transactional
    public ObjectNode actualizarProducto(long id, JsonNode body, long usuarioId, String actor) {
        JsonNode d = body.path("product");
        Map<String, Object> actual = jdbc.queryForMap("SELECT historial, categoria_id FROM productos_inventario WHERE id = ? AND activo = 1", id);
        long categoria = d.has("category") ? categoriaId(d.path("category").asText()) : ((Number) actual.get("categoria_id")).longValue();
        validarProducto(d, id);
        ArrayNode historial = json.createArrayNode();
        String at = LocalDateTime.now().format(MINUTO);
        body.path("summary").forEach(t -> historial.addObject().put("at", at).put("by", actor).put("text", t.asText()));
        leerArreglo((String) actual.get("historial")).forEach(historial::add);
        jdbc.update("UPDATE productos_inventario SET nombre = ?, categoria_id = ?, descripcion = ?, unidad = ?, stock_minimo = ?, ubicacion = ?, "
                        + "proveedor_id = ?, costo_unitario = ?, precio_referencia = ?, controla_vencimiento = ?, fecha_vencimiento = ?, historial = ? WHERE id = ?",
                d.path("name").asText().trim(), categoria, d.path("description").asText("").trim(), d.path("unit").asText(),
                BigDecimal.valueOf(d.path("minStock").asDouble(0)), d.path("location").asText("").trim(),
                d.hasNonNull("supplierId") ? d.path("supplierId").asLong() : null, BigDecimal.valueOf(d.path("unitCost").asDouble(0)),
                d.hasNonNull("refPrice") ? BigDecimal.valueOf(d.path("refPrice").asDouble()) : null, d.path("tracksExpiry").asBoolean(false),
                fecha(d.path("expiryDate").asText("")), historial.toString(), id);
        sincronizarAlertas(null, usuarioId);
        return productos().stream().filter(p -> String.valueOf(id).equals(p.path("id").asText())).findFirst().orElseThrow();
    }

    private void validarProducto(JsonNode d, Long id) {
        String nombre = d.path("name").asText("").trim();
        if (nombre.length() < 3) throw new ResponseStatusException(BAD_REQUEST, "Escribe el nombre del producto");
        Integer dup = jdbc.queryForObject("SELECT COUNT(*) FROM productos_inventario WHERE LOWER(nombre) = LOWER(?) AND activo = 1 AND id <> ?",
                Integer.class, nombre, id == null ? -1 : id);
        if (dup != null && dup > 0) throw new ResponseStatusException(CONFLICT, "Ya existe un producto llamado " + nombre);
        if (d.path("unit").asText("").isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Falta la unidad de medida");
        if (d.path("minStock").asDouble(0) < 0 || d.path("unitCost").asDouble(0) < 0) throw new ResponseStatusException(BAD_REQUEST, "Los valores no pueden ser negativos");
        if (d.path("tracksExpiry").asBoolean(false) && d.path("expiryDate").asText("").isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "Indica la fecha de vencimiento");
        }
    }

    private long categoriaId(String nombre) {
        List<Long> id = jdbc.queryForList("SELECT id FROM categorias_inventario WHERE nombre = ?", Long.class, nombre);
        if (id.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "No existe la categoría " + nombre);
        return id.get(0);
    }

    private long categoriaEnUso(String nombre) {
        long id = categoriaId(nombre);
        Boolean enUso = jdbc.queryForObject("SELECT en_uso FROM categorias_inventario WHERE id = ?", Boolean.class, id);
        if (!Boolean.TRUE.equals(enUso)) throw new ResponseStatusException(CONFLICT, "La categoría " + nombre + " está en pausa: no se usa por ahora");
        return id;
    }

    // ── Movimientos ──────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ObjectNode> movimientos() {
        Map<Long, ArrayNode> lineas = new HashMap<>();
        jdbc.query("SELECT l.*, p.codigo, p.nombre, p.unidad FROM movimiento_inventario_lineas l JOIN productos_inventario p ON p.id = l.producto_id ORDER BY l.id",
                rs -> {
                    ObjectNode o = lineas.computeIfAbsent(rs.getLong("movimiento_id"), k -> json.createArrayNode()).addObject();
                    o.put("productId", String.valueOf(rs.getLong("producto_id")));
                    o.put("code", rs.getString("codigo"));
                    o.put("name", rs.getString("nombre"));
                    o.put("unit", rs.getString("unidad"));
                    o.put("qty", rs.getBigDecimal("cantidad").doubleValue());
                    o.put("unitCost", rs.getBigDecimal("costo_unitario").longValue());
                    o.put("before", rs.getBigDecimal("existencia_antes").doubleValue());
                    o.put("after", rs.getBigDecimal("existencia_despues").doubleValue());
                    if (rs.getString("motivo") != null) o.put("reason", rs.getString("motivo"));
                    if (rs.getString("nota") != null) o.put("note", rs.getString("nota"));
                });
        return jdbc.query("SELECT m.*, t.nombre proveedor FROM movimientos_inventario m LEFT JOIN terceros t ON t.id = m.proveedor_id ORDER BY m.fecha, m.id",
                (rs, i) -> {
                    ObjectNode o = json.createObjectNode();
                    LocalDateTime f = rs.getTimestamp("fecha").toLocalDateTime();
                    o.put("id", String.valueOf(rs.getLong("id")));
                    o.put("number", rs.getString("numero"));
                    o.put("kind", rs.getString("tipo"));
                    o.put("reason", rs.getString("motivo"));
                    o.put("date", f.toLocalDate().toString());
                    o.put("time", f.format(DateTimeFormatter.ofPattern("HH:mm")));
                    o.put("user", texto(rs.getString("usuario_nombre")));
                    o.set("lines", lineas.getOrDefault(rs.getLong("id"), json.createArrayNode()));
                    if (rs.getString("proveedor") != null) o.put("supplier", rs.getString("proveedor"));
                    poner(o, "invoice", rs.getString("factura_proveedor"));
                    poner(o, "receivedBy", rs.getString("recibido_por"));
                    poner(o, "area", rs.getString("area"));
                    poner(o, "deliveredTo", rs.getString("entregado_a"));
                    poner(o, "reference", rs.getString("referencia"));
                    poner(o, "location", rs.getString("ubicacion"));
                    o.put("observations", texto(rs.getString("observaciones")));
                    return o;
                });
    }

    /**
     * Registra un movimiento. body: { kind: Entrada|Salida|Ajuste|Inicial, reason, date, supplierId, invoice,
     * receivedBy, area, deliveredTo, reference, location, observations,
     * lines: [{ productId, qty (entradas/salidas, positiva), unitCost (entradas), counted (ajustes), reason, note }] }
     */
    @Transactional
    public ObjectNode registrar(JsonNode d, long usuarioId, String actor) {
        String tipo = d.path("kind").asText("");
        String motivo = d.path("reason").asText("").trim();
        if (!PREFIJOS.containsKey(tipo)) throw new ResponseStatusException(BAD_REQUEST, "Tipo de movimiento no válido");
        if ("Entrada".equals(tipo) && !MOTIVOS_ENTRADA.contains(motivo)) throw new ResponseStatusException(BAD_REQUEST, "Tipo de entrada no válido");
        if ("Salida".equals(tipo) && !MOTIVOS_SALIDA.contains(motivo)) throw new ResponseStatusException(BAD_REQUEST, "Motivo de salida no válido");
        if ("Ajuste".equals(tipo) && !MOTIVOS_AJUSTE.contains(motivo)) throw new ResponseStatusException(BAD_REQUEST, "Tipo de ajuste no válido");
        LocalDate dia = fecha(d.path("date").asText(""));
        if (dia == null) throw new ResponseStatusException(BAD_REQUEST, "Falta la fecha");
        if (dia.isAfter(LocalDate.now())) throw new ResponseStatusException(BAD_REQUEST, "La fecha no puede ser futura");
        Long proveedor = d.hasNonNull("supplierId") ? d.path("supplierId").asLong() : null;
        if ("Entrada".equals(tipo) && "Compra".equals(motivo) && proveedor == null) throw new ResponseStatusException(BAD_REQUEST, "Falta el proveedor de la compra");
        if ("Salida".equals(tipo) && d.path("area").asText("").isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Falta el área responsable");
        if (!d.path("lines").isArray() || d.path("lines").isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Agrega al menos un producto");

        // Líneas: se bloquean los productos para calcular antes/después sin carreras
        record Linea(long producto, String nombre, String unidad, BigDecimal antes, BigDecimal cantidad, BigDecimal costo,
                     BigDecimal costoProducto, String motivo, String nota) { }
        List<Linea> lineas = new ArrayList<>();
        Set<Long> vistos = new HashSet<>();
        for (JsonNode l : d.path("lines")) {
            long pid = l.path("productId").asLong();
            if (!vistos.add(pid)) throw new ResponseStatusException(BAD_REQUEST, "Un producto aparece dos veces");
            List<Map<String, Object>> fila = jdbc.queryForList("SELECT p.nombre, p.unidad, p.existencias, p.costo_unitario, c.en_uso FROM productos_inventario p "
                    + "JOIN categorias_inventario c ON c.id = p.categoria_id WHERE p.id = ? AND p.activo = 1 FOR UPDATE", pid);
            if (fila.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Producto no encontrado");
            Map<String, Object> p = fila.get(0);
            String nombre = (String) p.get("nombre"), unidad = (String) p.get("unidad");
            BigDecimal antes = (BigDecimal) p.get("existencias"), costoProducto = (BigDecimal) p.get("costo_unitario");
            boolean enUso = Boolean.TRUE.equals(p.get("en_uso")) || Integer.valueOf(1).equals(p.get("en_uso"));
            if (!enUso && !"Salida".equals(tipo) && !"Ajuste".equals(tipo)) {
                throw new ResponseStatusException(CONFLICT, nombre + " es de una categoría en pausa: no se usa por ahora");
            }
            BigDecimal cantidad;
            String motivoLinea = l.path("reason").asText("").trim();   // puede cambiar abajo (conteo inicial)
            if ("Ajuste".equals(tipo)) {
                BigDecimal contado = BigDecimal.valueOf(l.path("counted").asDouble(-1));
                if (contado.signum() < 0) throw new ResponseStatusException(BAD_REQUEST, nombre + " no puede quedar con existencias negativas");
                exigirUnidad(nombre, unidad, contado);
                // Primer conteo de un producto de catálogo: son sus existencias iniciales, no una diferencia
                Integer previos = jdbc.queryForObject("SELECT COUNT(*) FROM movimiento_inventario_lineas WHERE producto_id = ?", Integer.class, pid);
                if (previos != null && previos == 0) motivoLinea = "Conteo inicial";
                if (motivoLinea.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Falta el motivo del ajuste de " + nombre);
                cantidad = contado.subtract(antes);
                if (cantidad.signum() == 0) continue;            // sin diferencia: no genera línea
            } else {
                cantidad = BigDecimal.valueOf(l.path("qty").asDouble(0));
                if (cantidad.signum() <= 0) throw new ResponseStatusException(BAD_REQUEST, "La cantidad de " + nombre + " debe ser mayor que 0");
                exigirUnidad(nombre, unidad, cantidad);
                if ("Salida".equals(tipo)) {
                    if (cantidad.compareTo(antes) > 0) {
                        throw new ResponseStatusException(CONFLICT, nombre + " tiene " + antes.stripTrailingZeros().toPlainString() + " " + unidad
                                + " y se piden " + cantidad.stripTrailingZeros().toPlainString());
                    }
                    cantidad = cantidad.negate();
                }
            }
            BigDecimal costo = cantidad.signum() > 0 && ("Entrada".equals(tipo) || "Inicial".equals(tipo))
                    ? BigDecimal.valueOf(l.path("unitCost").asDouble(-1)) : costoProducto;
            if (costo.signum() < 0) throw new ResponseStatusException(BAD_REQUEST, "Falta el costo unitario de " + nombre);
            lineas.add(new Linea(pid, nombre, unidad, antes, cantidad, costo, costoProducto, motivoLinea.isEmpty() ? null : motivoLinea,
                    l.path("note").asText("").trim().isEmpty() ? null : l.path("note").asText().trim()));
        }
        if (lineas.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "No hay diferencias para ajustar");

        String numero = siguienteNumero(PREFIJOS.get(tipo), dia.getYear());
        LocalDateTime cuando = dia.equals(LocalDate.now()) ? LocalDateTime.now().withSecond(0).withNano(0) : dia.atTime(LocalDateTime.now().toLocalTime().withSecond(0).withNano(0));
        GeneratedKeyHolder llave = new GeneratedKeyHolder();
        jdbc.update(c -> {
            PreparedStatement ps = c.prepareStatement("INSERT INTO movimientos_inventario (numero, tipo, motivo, fecha, usuario_id, usuario_nombre, proveedor_id, "
                    + "factura_proveedor, recibido_por, area, entregado_a, referencia, ubicacion, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, numero);
            ps.setString(2, tipo);
            ps.setString(3, motivo);
            ps.setTimestamp(4, Timestamp.valueOf(cuando));
            ps.setObject(5, usuarioId > 0 ? usuarioId : null);
            ps.setString(6, actor);
            ps.setObject(7, "Entrada".equals(tipo) ? proveedor : null);
            ps.setString(8, vacio(d.path("invoice").asText("")));
            ps.setString(9, vacio(d.path("receivedBy").asText("")));
            ps.setString(10, vacio(d.path("area").asText("")));
            ps.setString(11, vacio(d.path("deliveredTo").asText("")));
            ps.setString(12, vacio(d.path("reference").asText("")));
            ps.setString(13, vacio(d.path("location").asText("")));
            ps.setString(14, vacio(d.path("observations").asText("")));
            return ps;
        }, llave);
        long movimiento = Objects.requireNonNull(llave.getKey()).longValue();

        for (Linea l : lineas) {
            BigDecimal despues = l.antes().add(l.cantidad());
            // Costo promedio ponderado: solo las entradas con costo cambian el costo del producto
            // Si el costo del producto aún no se conocía ($0, p. ej. tras el conteo inicial), toma el de la compra
            boolean entra = l.cantidad().signum() > 0 && ("Entrada".equals(tipo) || "Inicial".equals(tipo)) && despues.signum() > 0;
            BigDecimal costoNuevo = !entra ? l.costoProducto()
                    : l.costoProducto().signum() == 0 ? l.costo().setScale(0, RoundingMode.HALF_UP)
                    : l.antes().multiply(l.costoProducto()).add(l.cantidad().multiply(l.costo())).divide(despues, 0, RoundingMode.HALF_UP);
            jdbc.update("INSERT INTO movimiento_inventario_lineas (movimiento_id, producto_id, cantidad, costo_unitario, existencia_antes, existencia_despues, motivo, nota) "
                    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", movimiento, l.producto(), l.cantidad(), l.costo(), l.antes(), despues, l.motivo(), l.nota());
            jdbc.update("UPDATE productos_inventario SET existencias = ?, costo_unitario = ? WHERE id = ?", despues, costoNuevo, l.producto());
        }
        sincronizarAlertas(numero, usuarioId);
        String id = String.valueOf(movimiento);
        return movimientos().stream().filter(m -> id.equals(m.path("id").asText())).findFirst().orElseThrow();
    }

    private static void exigirUnidad(String nombre, String unidad, BigDecimal cantidad) {
        if (!FRACCIONABLES.contains(unidad) && cantidad.stripTrailingZeros().scale() > 0) {
            throw new ResponseStatusException(BAD_REQUEST, nombre + " se maneja en unidades enteras");
        }
    }

    private String siguienteNumero(String prefijo, int anio) {
        jdbc.update("INSERT IGNORE INTO consecutivos (prefijo, anio, ultimo) VALUES (?, ?, 0)", prefijo, anio);
        jdbc.update("UPDATE consecutivos SET ultimo = ultimo + 1 WHERE prefijo = ? AND anio = ?", prefijo, anio);
        Integer n = jdbc.queryForObject("SELECT ultimo FROM consecutivos WHERE prefijo = ? AND anio = ?", Integer.class, prefijo, anio);
        return String.format("%s-%d-%04d", prefijo, anio, n);
    }

    /** Número que tendría el próximo movimiento (vista previa en los formularios). */
    @Transactional(readOnly = true)
    public Map<String, String> proximosNumeros() {
        int anio = LocalDate.now().getYear();
        Map<String, String> r = new HashMap<>();
        PREFIJOS.forEach((tipo, pref) -> {
            List<Integer> u = jdbc.queryForList("SELECT ultimo FROM consecutivos WHERE prefijo = ? AND anio = ?", Integer.class, pref, anio);
            r.put(tipo, String.format("%s-%d-%04d", pref, anio, (u.isEmpty() ? 0 : u.get(0)) + 1));
        });
        return r;
    }

    // ── Alertas ──────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ObjectNode> alertas() {
        return jdbc.query("SELECT a.*, CONCAT(u.nombre, ' ', COALESCE(u.apellido, '')) quien FROM alertas_inventario a "
                + "LEFT JOIN usuarios u ON u.id = a.atendida_por ORDER BY a.id", (rs, i) -> {
            ObjectNode o = json.createObjectNode();
            o.put("id", rs.getLong("id"));
            o.put("key", rs.getString("tipo") + "-" + rs.getLong("producto_id"));
            o.put("type", rs.getString("tipo"));
            o.put("productId", String.valueOf(rs.getLong("producto_id")));
            o.put("priority", rs.getString("prioridad"));
            o.put("generatedAt", rs.getTimestamp("generada_at").toLocalDateTime().format(MINUTO));
            o.put("status", rs.getString("estado"));
            if (rs.getTimestamp("atendida_at") != null) o.put("attendedAt", rs.getTimestamp("atendida_at").toLocalDateTime().format(MINUTO));
            String quien = rs.getString("quien");
            o.put("attendedBy", quien == null || quien.isBlank() ? ("Atendida".equals(rs.getString("estado")) ? "Sistema" : "") : quien.trim());
            poner(o, "attendedRef", rs.getString("referencia_atencion"));
            if (rs.getTimestamp("compra_solicitada_at") != null) o.put("purchaseRequestedAt", rs.getTimestamp("compra_solicitada_at").toLocalDateTime().format(MINUTO));
            return o;
        });
    }

    @Transactional
    public void atender(long id, long usuarioId) {
        int n = jdbc.update("UPDATE alertas_inventario SET estado = 'Atendida', atendida_at = NOW(), atendida_por = ?, referencia_atencion = 'Manual' "
                + "WHERE id = ? AND estado = 'Activa'", usuarioId > 0 ? usuarioId : null, id);
        if (n == 0) throw new ResponseStatusException(NOT_FOUND, "La alerta ya no está activa");
    }

    @Transactional
    public void solicitarCompra(long productoId) {
        jdbc.update("UPDATE alertas_inventario SET compra_solicitada_at = NOW() WHERE producto_id = ? AND estado = 'Activa'", productoId);
    }

    /**
     * Genera las alertas nuevas y cierra las que dejaron de aplicar. Solo cuentan los productos
     * de categorías en uso que ya tienen existencias registradas (con al menos un movimiento):
     * un producto de catálogo aún sin contar no es "agotado". Una alerta atendida a mano no se
     * repite mientras siga la misma condición.
     */
    @Transactional
    public void sincronizarAlertas(String referencia, Long usuarioId) {
        JsonNode cfg = config.leer("inventario_alertas").orElse(json.createObjectNode());
        int diasVence = cfg.path("expiryDays").asInt(7);
        boolean stockBajo = cfg.path("lowStock").asBoolean(true);
        LocalDate hoy = LocalDate.now();
        Map<String, String[]> ahora = new HashMap<>();        // clave → [tipo, productoId, prioridad]
        jdbc.query("SELECT p.id, p.existencias, p.stock_minimo, p.controla_vencimiento, p.fecha_vencimiento FROM productos_inventario p "
                + "JOIN categorias_inventario c ON c.id = p.categoria_id WHERE p.activo = 1 AND c.en_uso = 1 "
                + "AND EXISTS (SELECT 1 FROM movimiento_inventario_lineas l WHERE l.producto_id = p.id)", rs -> {
            long id = rs.getLong("id");
            BigDecimal stock = rs.getBigDecimal("existencias"), minimo = rs.getBigDecimal("stock_minimo");
            if (stock.signum() <= 0) ahora.put("Agotado-" + id, new String[]{"Agotado", String.valueOf(id), "Alta"});
            else if (stockBajo && stock.compareTo(minimo) <= 0) ahora.put("Stock bajo-" + id, new String[]{"Stock bajo", String.valueOf(id), "Media"});
            if (rs.getBoolean("controla_vencimiento") && rs.getDate("fecha_vencimiento") != null && stock.signum() > 0) {
                long dias = java.time.temporal.ChronoUnit.DAYS.between(hoy, rs.getDate("fecha_vencimiento").toLocalDate());
                if (dias <= diasVence) ahora.put("Por vencer-" + id, new String[]{"Por vencer", String.valueOf(id), dias <= 2 ? "Alta" : dias <= 5 ? "Media" : "Baja"});
            }
        });
        // Última alerta de cada clave
        Map<String, Map<String, Object>> ultimas = new HashMap<>();
        jdbc.queryForList("SELECT id, tipo, producto_id, estado, referencia_atencion FROM alertas_inventario ORDER BY id")
                .forEach(a -> ultimas.put(a.get("tipo") + "-" + a.get("producto_id"), a));
        ahora.forEach((clave, c) -> {
            Map<String, Object> u = ultimas.get(clave);
            boolean activa = u != null && "Activa".equals(u.get("estado"));
            boolean manual = u != null && "Manual".equals(u.get("referencia_atencion"));
            if (activa && u != null) jdbc.update("UPDATE alertas_inventario SET prioridad = ? WHERE id = ?", c[2], u.get("id"));
            else if (!manual) jdbc.update("INSERT INTO alertas_inventario (tipo, producto_id, prioridad) VALUES (?, ?, ?)", c[0], Long.valueOf(c[1]), c[2]);
        });
        ultimas.forEach((clave, u) -> {
            if ("Activa".equals(u.get("estado")) && !ahora.containsKey(clave)) {
                jdbc.update("UPDATE alertas_inventario SET estado = 'Atendida', atendida_at = NOW(), atendida_por = ?, referencia_atencion = ? WHERE id = ?",
                        usuarioId, referencia == null ? "Actualización del producto" : referencia, u.get("id"));
            } else if ("Manual".equals(u.get("referencia_atencion")) && !ahora.containsKey(clave)) {
                // La condición se resolvió: si vuelve a pasar, se genera una alerta nueva
                jdbc.update("UPDATE alertas_inventario SET referencia_atencion = 'Manual · resuelta' WHERE id = ?", u.get("id"));
            }
        });
    }

    // ── Utilidades ───────────────────────────────────────

    private ArrayNode leerArreglo(String s) {
        try {
            JsonNode n = s == null ? null : json.readTree(s);
            return n instanceof ArrayNode a ? a : json.createArrayNode();
        } catch (Exception e) {
            return json.createArrayNode();
        }
    }

    private static LocalDate fecha(String s) {
        try { return s == null || s.isBlank() ? null : LocalDate.parse(s.substring(0, 10)); } catch (Exception e) { return null; }
    }

    private static void poner(ObjectNode o, String campo, String valor) { if (valor != null && !valor.isBlank()) o.put(campo, valor); }
    private static String vacio(String s) { return s == null || s.isBlank() ? null : s.trim(); }
    private static String texto(String s) { return s == null ? "" : s; }
}
