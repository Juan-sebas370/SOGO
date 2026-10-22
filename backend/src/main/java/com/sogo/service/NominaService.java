package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.entity.Empleado;
import com.sogo.entity.Nomina;
import com.sogo.repository.EmpleadoRepository;
import com.sogo.repository.NominaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;

import static org.springframework.http.HttpStatus.*;

/**
 * Corridas de nómina. El objeto `PayrollRun` del frontend se guarda completo en `nominas.datos`;
 * además el servidor:
 *  · controla el ciclo Borrador → Confirmada → Pagada (o Anulada): una nómina confirmada no
 *    cambia sus liquidaciones, una pagada no se anula y una anulada ya no se modifica;
 *  · registra quién confirmó, pagó o anuló (usuario de la sesión, no el que diga el navegador);
 *  · copia el detalle a `nomina_novedades`, `nomina_liquidaciones` y `comprobantes_pago`.
 */
@Service
public class NominaService {

    private static final Logger log = LoggerFactory.getLogger(NominaService.class);
    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    private static final List<String> ESTADOS = List.of("Borrador", "Confirmada", "Pagada", "Anulada");
    private static final Map<String, List<String>> SIGUIENTES = Map.of(
            "Borrador", List.of("Borrador", "Confirmada", "Anulada"),
            "Confirmada", List.of("Confirmada", "Pagada", "Anulada"),
            "Pagada", List.of("Pagada"),
            "Anulada", List.of());

    private final NominaRepository nominas;
    private final EmpleadoRepository empleados;
    private final PermisoService permisos;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ObjectMapper json;

    public NominaService(NominaRepository nominas, EmpleadoRepository empleados, PermisoService permisos, JdbcTemplate jdbc,
                         PlatformTransactionManager txManager, ObjectMapper json) {
        this.nominas = nominas;
        this.empleados = empleados;
        this.permisos = permisos;
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(txManager);
        this.json = json;
    }

    @Transactional(readOnly = true)
    public List<JsonNode> listar() {
        return nominas.findAll().stream()
                .sorted(Comparator.comparing(Nomina::getId))
                .map(n -> leer(n.getDatos()))
                .filter(Objects::nonNull).toList();
    }

    /** Crea o actualiza la corrida por su id, validando el cambio de estado y los permisos. */
    @Transactional
    public JsonNode guardar(String clave, JsonNode body, String login) {
        if (!(body instanceof ObjectNode d)) throw new ResponseStatusException(BAD_REQUEST, "Nómina no válida");
        String periodo = d.path("period").asText("");
        if (!periodo.matches("\\d{4}-(0[1-9]|1[0-2])")) throw new ResponseStatusException(BAD_REQUEST, "Período no válido: " + periodo);
        String nuevo = d.path("status").asText("Borrador");
        if (!ESTADOS.contains(nuevo)) throw new ResponseStatusException(BAD_REQUEST, "Estado no válido: " + nuevo);
        d.put("id", clave);

        Long uid = permisos.usuarioId(login);
        String nombre = permisos.nombre(login);
        LocalDateTime ahora = LocalDateTime.now();
        Optional<Nomina> previa = nominas.findByClave(clave);
        JsonNode vieja = previa.map(x -> leer(x.getDatos())).orElse(null);
        String anterior = previa.map(x -> x.getEstado() == null ? "Borrador" : x.getEstado()).orElse(null);
        Nomina n;

        if (previa.isEmpty()) {
            // Toda nómina nace en borrador: se liquida, se confirma y se paga en SOGO
            permisos.exigir(login, "Nómina", "create");
            if (!"Borrador".equals(nuevo)) throw new ResponseStatusException(BAD_REQUEST, "Una nómina nueva empieza en borrador");
            exigirPeriodoLibre(periodo, clave);
            n = new Nomina();
            n.setClave(clave);
            n.setPeriodo(periodo);
            n.setCreadoAt(ahora);
            n.setCreadoPor(uid);
            d.put("createdBy", nombre);
        } else {
            n = previa.get();
            if (!periodo.equals(n.getPeriodo())) throw new ResponseStatusException(CONFLICT, "No se puede cambiar el período de una nómina");
            if ("Anulada".equals(anterior)) throw new ResponseStatusException(CONFLICT, "La nómina de " + periodo + " está anulada: ya no se puede modificar");
            if (!SIGUIENTES.get(anterior).contains(nuevo)) {
                throw new ResponseStatusException(CONFLICT, "Una nómina " + anterior.toLowerCase() + " no puede pasar a " + nuevo.toLowerCase());
            }
            if (!"Borrador".equals(anterior) && vieja != null) {
                // Lo liquidado y confirmado queda congelado
                if (!igual(vieja.path("lines"), d.path("lines")) || !igual(vieja.path("novelties"), d.path("novelties"))
                        || !igual(vieja.path("corrections"), d.path("corrections"))) {
                    throw new ResponseStatusException(CONFLICT, "La nómina de " + periodo + " ya está " + anterior.toLowerCase() + ": sus liquidaciones no se pueden cambiar");
                }
                vieja.path("payslips").fields().forEachRemaining(p -> {
                    if (!p.getValue().path("number").asText().equals(d.path("payslips").path(p.getKey()).path("number").asText())) {
                        throw new ResponseStatusException(CONFLICT, "No se puede quitar ni renumerar el comprobante " + p.getValue().path("number").asText());
                    }
                });
            }
            if (anterior.equals(nuevo)) {
                permisos.exigir(login, "Nómina", "edit");
            } else if ("Confirmada".equals(nuevo)) {
                permisos.exigir(login, "Nómina", "edit");
                exigirLineas(d, true);
                exigirDiasLaborados(d, periodo);
                n.setConfirmadoAt(ahora);
                n.setConfirmadoPor(uid);
                d.put("confirmedBy", nombre);
            } else if ("Pagada".equals(nuevo)) {
                permisos.exigir(login, "Nómina", "edit");
                n.setPagadoAt(ahora);
                n.setPagadoPor(uid);
                d.put("paidBy", nombre);
            } else if ("Anulada".equals(nuevo)) {
                permisos.exigir(login, "Nómina", "delete");
                if (vieja != null && vieja.path("payments").isObject() && !vieja.path("payments").isEmpty()) {
                    throw new ResponseStatusException(CONFLICT, "Ya se registraron pagos por Nequi en esta nómina: no se puede anular");
                }
                String motivo = d.path("annulment").path("reason").asText("").trim();
                if (motivo.length() < 5) throw new ResponseStatusException(BAD_REQUEST, "Indica el motivo de la anulación");
                n.setAnuladoAt(ahora);
                n.setAnuladoPor(uid);
                n.setMotivoAnulacion(motivo.length() > 255 ? motivo.substring(0, 255) : motivo);
                ((ObjectNode) d.path("annulment")).put("by", nombre);
            }
        }
        if ("Borrador".equals(nuevo)) validarNovedades(d);
        validarPagos(vieja, d, nuevo, nombre, ahora);

        String pago = d.path("payDate").asText("");
        n.setFechaPago(pago.length() >= 10 ? LocalDate.parse(pago.substring(0, 10)) : YearMonth.parse(periodo).atEndOfMonth());
        n.setEstado(nuevo);
        totales(n, d);
        n.setDatos(d.toString());
        nominas.saveAndFlush(n);
        sincronizar(n, d, uid);
        return d;
    }

    // ── Reglas de días, novedades y pagos ────────────────

    /**
     * Días laborados en el período con mes comercial de 30 días (igual que la aplicación):
     * nadie cobra días antes de su ingreso ni después de su retiro.
     */
    static int diasLaborados(LocalDate ingreso, LocalDate retiro, YearMonth periodo) {
        LocalDate inicio = periodo.atDay(1), fin = periodo.atEndOfMonth();
        if (ingreso == null || ingreso.isAfter(fin) || (retiro != null && retiro.isBefore(inicio))) return 0;
        int desde = ingreso.isAfter(inicio) ? Math.min(30, ingreso.getDayOfMonth()) : 1;
        int hasta = retiro != null && retiro.isBefore(fin) ? Math.min(30, retiro.getDayOfMonth()) : 30;
        return Math.max(0, hasta - desde + 1);
    }

    /** Al confirmar: cada línea es de un empleado que sí trabajó esos días (retiros e ingresos). */
    private void exigirDiasLaborados(JsonNode d, String periodo) {
        YearMonth p = YearMonth.parse(periodo);
        Map<String, Empleado> porClave = new HashMap<>();
        empleados.findAll().forEach(e -> porClave.put(e.claveOId(), e));
        Set<String> vistos = new HashSet<>();
        for (JsonNode l : d.path("lines")) {
            String id = l.path("employeeId").asText();
            String quien = l.path("name").asText(id);
            if (!vistos.add(id)) throw new ResponseStatusException(CONFLICT, quien + " aparece dos veces en la nómina");
            Empleado e = porClave.get(id);
            if (e == null) throw new ResponseStatusException(CONFLICT, quien + " ya no existe en Empleados");
            int dias = diasLaborados(e.getFechaContratacion(), e.getFechaTerminacion(), p);
            if (dias == 0) {
                throw new ResponseStatusException(CONFLICT, quien + " no laboró en " + periodo
                        + ("Retirado".equals(e.getEstado()) ? " (está retirado desde " + e.getFechaTerminacion() + ")" : " (ingresa el " + e.getFechaContratacion() + ")"));
            }
            if (l.path("days").asInt() > dias) {
                throw new ResponseStatusException(CONFLICT, quien + " laboró " + dias + " días en " + periodo + ", no " + l.path("days").asInt());
            }
        }
    }

    /** Horas y bonificaciones no negativas; extras hasta 48 h al mes (2 diarias, 12 semanales). */
    private static void validarNovedades(JsonNode d) {
        d.path("novelties").fields().forEachRemaining(x -> {
            JsonNode v = x.getValue();
            for (String k : List.of("extraDay", "extraNight", "nightHours", "sundayHours", "bonusSalary", "bonusNonSalary")) {
                if (v.path(k).asDouble(0) < 0) throw new ResponseStatusException(BAD_REQUEST, "Las novedades no pueden ser negativas");
            }
            if (v.path("extraDay").asDouble(0) + v.path("extraNight").asDouble(0) > 48) {
                throw new ResponseStatusException(BAD_REQUEST, "Las horas extra no pueden superar 48 h en el mes");
            }
            if (v.path("nightHours").asDouble(0) > 240 || v.path("sundayHours").asDouble(0) > 240) {
                throw new ResponseStatusException(BAD_REQUEST, "Las horas con recargo no pueden superar las horas del mes");
            }
        });
    }

    /**
     * Pagos por Nequi, uno por empleado: solo después de confirmar, por el neto exacto de su
     * liquidación, con la referencia de la transferencia. Lo pagado no se cambia; la firma de
     * recibido se registra una sola vez. La nómina queda Pagada cuando todos tienen su pago.
     */
    private void validarPagos(JsonNode vieja, ObjectNode d, String estado, String nombre, LocalDateTime ahora) {
        JsonNode pagos = d.path("payments");
        JsonNode antes = vieja == null ? json.createObjectNode() : vieja.path("payments");
        boolean hay = pagos.isObject() && !pagos.isEmpty();
        if ("Borrador".equals(estado) || "Anulada".equals(estado)) {
            if (hay && !igual(antes, pagos)) throw new ResponseStatusException(CONFLICT, "Los pagos se registran después de confirmar la liquidación");
            return;
        }
        Map<String, Double> netos = new HashMap<>();
        d.path("lines").forEach(l -> netos.put(l.path("employeeId").asText(), l.path("net").asDouble()));
        d.path("corrections").forEach(c -> netos.put(c.path("employeeId").asText(), c.path("line").path("net").asDouble()));
        Set<String> referencias = new HashSet<>();
        if (hay) {
            Iterator<Map.Entry<String, JsonNode>> it = pagos.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> x = it.next();
                ObjectNode p = (ObjectNode) x.getValue();
                JsonNode previo = antes.path(x.getKey());
                if (!netos.containsKey(x.getKey())) throw new ResponseStatusException(CONFLICT, "Hay un pago de alguien que no está en esta nómina");
                if (previo.isMissingNode()) {
                    if (!"Nequi".equals(p.path("method").asText())) throw new ResponseStatusException(BAD_REQUEST, "Por ahora los pagos se hacen solo por Nequi");
                    if (!p.path("to").asText("").matches("3\\d{9}")) throw new ResponseStatusException(BAD_REQUEST, "El número Nequi debe ser un celular de 10 dígitos que empieza por 3");
                    String ref = p.path("reference").asText("").trim();
                    if (ref.length() < 4 || ref.length() > 40) throw new ResponseStatusException(BAD_REQUEST, "Escribe la referencia de la transferencia Nequi");
                    if (Math.abs(p.path("amount").asDouble() - netos.get(x.getKey())) >= 1) {
                        throw new ResponseStatusException(CONFLICT, "El valor pagado debe ser el neto de la liquidación");
                    }
                    Integer usada = jdbc.queryForObject("SELECT COUNT(*) FROM nomina_pagos WHERE medio = 'Nequi' AND referencia = ?", Integer.class, ref);
                    if (usada != null && usada > 0) throw new ResponseStatusException(CONFLICT, "La referencia Nequi " + ref + " ya se usó en otro pago");
                    p.put("reference", ref);
                    p.put("paidAt", ahora.format(MINUTO));
                    p.put("paidBy", nombre);
                } else {
                    for (String k : List.of("method", "to", "amount", "reference", "paidAt", "paidBy")) {
                        if (!igual(previo.path(k), p.path(k))) throw new ResponseStatusException(CONFLICT, "Un pago registrado no se puede modificar");
                    }
                }
                if (!referencias.add(p.path("reference").asText())) throw new ResponseStatusException(CONFLICT, "Dos pagos tienen la misma referencia Nequi");
                // Firma de recibido: una vez, y no se cambia
                JsonNode firmaAntes = previo.path("receipt");
                JsonNode firma = p.path("receipt");
                if (!firmaAntes.isMissingNode() && !firmaAntes.isNull()) {
                    if (!igual(firmaAntes, firma)) throw new ResponseStatusException(CONFLICT, "La firma de recibido ya quedó registrada y no se puede cambiar");
                } else if (firma.isObject()) {
                    String img = firma.path("signature").asText("");
                    if (!img.startsWith("data:image/png;base64,") || img.length() < 200 || img.length() > 600_000) {
                        throw new ResponseStatusException(BAD_REQUEST, "La firma de recibido no es válida");
                    }
                    if (firma.path("name").asText("").trim().length() < 3) throw new ResponseStatusException(BAD_REQUEST, "Escribe el nombre de quien firma");
                    ((ObjectNode) firma).put("at", ahora.format(MINUTO));
                }
            }
        }
        // Ningún pago registrado puede desaparecer
        antes.fieldNames().forEachRemaining(k -> {
            if (!pagos.has(k)) throw new ResponseStatusException(CONFLICT, "Un pago registrado no se puede borrar");
        });
        if ("Pagada".equals(estado) && netos.keySet().stream().anyMatch(k -> !pagos.has(k))) {
            throw new ResponseStatusException(CONFLICT, "Falta registrar el pago Nequi de algún empleado");
        }
    }

    /**
     * Al iniciar el servidor, completa las tablas de detalle de las nóminas guardadas antes de
     * que existieran (por ejemplo, las importadas). Cada nómina va en su propia transacción.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void completarDetalle() {
        try {
            List<Long> ids = nominas.findAll().stream().map(Nomina::getId).toList();
            for (Long id : ids) {
                try {
                    tx.executeWithoutResult(s -> nominas.findById(id).ifPresent(n -> {
                        JsonNode d = leer(n.getDatos());
                        if (d == null) return;
                        totales(n, d);
                        sincronizar(n, d, n.getCreadoPor());
                    }));
                } catch (Exception e) {
                    log.warn("No se pudo completar el detalle de la nómina {}: {}", id, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("No se completó el detalle de las nóminas (¿falta ejecutar 08_nomina.sql?): {}", e.getMessage());
        }
    }

    // ── Reglas ───────────────────────────────────────────

    /** Solo una nómina vigente (no anulada) por período. */
    private void exigirPeriodoLibre(String periodo, String clave) {
        nominas.findAll().stream()
                .filter(o -> periodo.equals(o.getPeriodo()) && !"Anulada".equals(o.getEstado()) && !clave.equals(o.getClave()))
                .findFirst()
                .ifPresent(o -> { throw new ResponseStatusException(CONFLICT, "Ya existe una nómina de " + periodo + " (" + o.getEstado() + ")"); });
    }

    private static void exigirLineas(JsonNode d, boolean datosCompletos) {
        if (!d.path("lines").isArray() || d.path("lines").isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "La nómina no tiene empleados liquidados");
        }
        for (JsonNode l : d.path("lines")) {
            if (datosCompletos && l.path("issues").isArray() && !l.path("issues").isEmpty()) {
                throw new ResponseStatusException(BAD_REQUEST, l.path("name").asText("Un empleado") + " tiene datos incompletos: " + l.path("issues").get(0).asText());
            }
        }
    }

    /** Igualdad de JSON tolerante al formato de los números (MySQL puede devolver 5 o 5.0). */
    private static boolean igual(JsonNode a, JsonNode b) {
        if (a.isMissingNode() || a.isNull()) return b.isMissingNode() || b.isNull() || (b.isContainerNode() && b.isEmpty());
        if (b.isMissingNode() || b.isNull()) return a.isContainerNode() && a.isEmpty();
        return a.equals((x, y) -> x.isNumber() && y.isNumber()
                ? (Math.abs(x.asDouble() - y.asDouble()) < 0.005 ? 0 : 1)
                : (x.equals(y) ? 0 : 1), b);
    }

    // ── Detalle en tablas ────────────────────────────────

    /** Totales de las líneas vigentes (las corregidas reemplazan a la original). */
    private void totales(Nomina n, JsonNode d) {
        if (!d.path("lines").isArray() || d.path("lines").isEmpty()) {
            n.setNumEmpleados(null); n.setTotalDevengado(null); n.setTotalDeducciones(null); n.setTotalNeto(null);
            return;
        }
        Map<String, JsonNode> vigentes = new LinkedHashMap<>();
        d.path("lines").forEach(l -> vigentes.put(l.path("employeeId").asText(), l));
        d.path("corrections").forEach(c -> vigentes.put(c.path("employeeId").asText(), c.path("line")));
        n.setNumEmpleados(vigentes.size());
        n.setTotalDevengado(suma(vigentes.values(), "totalEarnings"));
        n.setTotalDeducciones(suma(vigentes.values(), "totalDeductions"));
        n.setTotalNeto(suma(vigentes.values(), "net"));
    }

    private static BigDecimal suma(Collection<JsonNode> lineas, String campo) {
        return lineas.stream().map(l -> BigDecimal.valueOf(l.path(campo).asDouble())).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Copia novedades, liquidaciones y comprobantes a sus tablas (idempotente). */
    private void sincronizar(Nomina n, JsonNode d, Long uid) {
        Map<String, Long> emp = new HashMap<>();
        for (Empleado e : empleados.findAll()) emp.put(e.claveOId(), e.getId());
        long nid = n.getId();

        // Novedades del período (mientras es borrador cambian; después quedan fijas)
        jdbc.update("DELETE FROM nomina_novedades WHERE nomina_id = ?", nid);
        d.path("novelties").fields().forEachRemaining(x -> {
            Long eid = emp.get(x.getKey());
            JsonNode v = x.getValue();
            if (eid == null) return;
            jdbc.update("INSERT INTO nomina_novedades (nomina_id, empleado_id, extra_diurna, extra_nocturna, horas_nocturnas, horas_dominicales, "
                            + "bonificacion_salarial, bonificacion_no_salarial) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    nid, eid, v.path("extraDay").asDouble(), v.path("extraNight").asDouble(), v.path("nightHours").asDouble(),
                    v.path("sundayHours").asDouble(), v.path("bonusSalary").asDouble(), v.path("bonusNonSalary").asDouble());
        });

        if (!d.path("lines").isArray() || d.path("lines").isEmpty()) return;

        // Liquidaciones congeladas: la original de cada empleado y, si la hay, su corrección
        Map<String, Long> liq = new HashMap<>();
        jdbc.query("SELECT id, empleado_id, es_correccion FROM nomina_liquidaciones WHERE nomina_id = ?",
                rs -> { liq.put(rs.getLong(2) + ":" + rs.getInt(3), rs.getLong(1)); }, nid);
        for (JsonNode l : d.path("lines")) insertarLiquidacion(nid, emp.get(l.path("employeeId").asText()), l, 0, liq);
        for (JsonNode c : d.path("corrections")) insertarLiquidacion(nid, emp.get(c.path("employeeId").asText()), c.path("line"), 1, liq);

        // Comprobantes
        d.path("payslips").fields().forEachRemaining(p -> {
            Long eid = emp.get(p.getKey());
            if (eid != null) guardarComprobante(nid, eid, liq.get(eid + ":0"), p.getValue(), uid);
        });
        for (JsonNode c : d.path("corrections")) {
            Long eid = emp.get(c.path("employeeId").asText());
            if (eid != null) guardarComprobante(nid, eid, liq.get(eid + ":1"), c.path("payslip"), uid);
        }
        // Pagos por Nequi y firmas de recibido (lo registrado no se cambia: solo se completa la firma)
        d.path("payments").fields().forEachRemaining(x -> {
            Long eid = emp.get(x.getKey());
            if (eid == null) return;
            JsonNode p = x.getValue(), r = p.path("receipt");
            boolean firmado = r.isObject() && r.hasNonNull("signature");
            jdbc.update("INSERT INTO nomina_pagos (nomina_id, empleado_id, medio, cuenta_destino, valor, referencia, pagado_at, pagado_por, "
                            + "recibido_at, recibido_nombre, firma) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE "
                            + "recibido_at = COALESCE(recibido_at, VALUES(recibido_at)), recibido_nombre = COALESCE(recibido_nombre, VALUES(recibido_nombre)), "
                            + "firma = COALESCE(firma, VALUES(firma))",
                    nid, eid, p.path("method").asText("Nequi"), p.path("to").asText(), p.path("amount").asDouble(), p.path("reference").asText(),
                    Timestamp.valueOf(fechaHora(p.path("paidAt").asText(null), LocalDateTime.now())), uid,
                    firmado ? Timestamp.valueOf(fechaHora(r.path("at").asText(null), LocalDateTime.now())) : null,
                    firmado ? r.path("name").asText() : null, firmado ? r.path("signature").asText() : null);
        });

        if ("Anulada".equals(n.getEstado())) {
            jdbc.update("UPDATE comprobantes_pago SET estado = 'Anulado', motivo = COALESCE(motivo, ?) WHERE nomina_id = ?",
                    "Nómina anulada: " + d.path("annulment").path("reason").asText(""), nid);
        }
    }

    private void insertarLiquidacion(long nid, Long eid, JsonNode l, int correccion, Map<String, Long> liq) {
        if (eid == null || l.isMissingNode() || liq.containsKey(eid + ":" + correccion)) return;
        jdbc.update("INSERT INTO nomina_liquidaciones (nomina_id, empleado_id, dias, salario_base, total_devengado, total_deducciones, neto, "
                        + "aportes_empleador, provisiones, devengos, deducciones, es_correccion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                nid, eid, l.path("days").asInt(), l.path("baseSalary").asDouble(), l.path("totalEarnings").asDouble(),
                l.path("totalDeductions").asDouble(), l.path("net").asDouble(), l.path("employer").path("total").asDouble(),
                l.path("provisions").path("total").asDouble(), l.path("earnings").toString(), l.path("deductions").toString(), correccion);
        Long id = jdbc.queryForObject("SELECT id FROM nomina_liquidaciones WHERE nomina_id = ? AND empleado_id = ? AND es_correccion = ? ORDER BY id DESC LIMIT 1",
                Long.class, nid, eid, correccion);
        liq.put(eid + ":" + correccion, id);
    }

    private void guardarComprobante(long nid, long eid, Long liqId, JsonNode p, Long uid) {
        String numero = p.path("number").asText("");
        if (numero.isEmpty() || liqId == null) return;
        List<Long> otra = jdbc.queryForList("SELECT nomina_id FROM comprobantes_pago WHERE numero = ?", Long.class, numero);
        if (!otra.isEmpty() && otra.get(0) != nid) {
            throw new ResponseStatusException(CONFLICT, "El comprobante " + numero + " ya existe en otra nómina");
        }
        String estado = "Anulado".equals(p.path("status").asText()) ? "Anulado" : "Generado";
        if (otra.isEmpty()) {
            jdbc.update("INSERT INTO comprobantes_pago (numero, nomina_id, empleado_id, liquidacion_id, generado_at, generado_por, estado, "
                            + "reemplazado_por, motivo, enviado_a) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    numero, nid, eid, liqId, Timestamp.valueOf(fechaHora(p.path("generatedAt").asText(null), LocalDateTime.now())), uid,
                    estado, texto(p, "replacedBy"), texto(p, "reason"), texto(p, "sentTo"));
        } else {
            jdbc.update("UPDATE comprobantes_pago SET estado = ?, reemplazado_por = ?, motivo = ?, enviado_a = ? WHERE numero = ?",
                    estado, texto(p, "replacedBy"), texto(p, "reason"), texto(p, "sentTo"), numero);
        }
    }

    // ── Utilidades ───────────────────────────────────────

    private JsonNode leer(String s) {
        try { return s == null ? null : json.readTree(s); } catch (Exception e) { return null; }
    }

    private static String texto(JsonNode p, String campo) {
        return p.hasNonNull(campo) && !p.path(campo).asText().isBlank() ? p.path(campo).asText() : null;
    }

    private static LocalDateTime fechaHora(String s, LocalDateTime porDefecto) {
        try {
            return s == null || s.length() < 16 ? porDefecto : LocalDateTime.parse(s.substring(0, 16), MINUTO);
        } catch (Exception e) {
            return porDefecto;
        }
    }
}
