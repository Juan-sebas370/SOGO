package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.entity.Empleado;
import com.sogo.entity.Empleado.Salario;
import com.sogo.entity.EmpleadoDeduccion;
import com.sogo.entity.Rol;
import com.sogo.entity.Usuario;
import com.sogo.repository.EmpleadoRepository;
import com.sogo.repository.UsuarioRepository;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

import static org.springframework.http.HttpStatus.*;

/**
 * Empleados con la forma de `Employee` del frontend (payroll.model.ts), sobre la tabla
 * `empleados` (compartida con la web) más `empleado_salarios` y `empleado_deducciones`.
 */
@Service
public class EmpleadoService {

    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    private final EmpleadoRepository empleados;
    private final UsuarioRepository usuarios;
    private final UsuarioEventoService eventos;
    private final AuditoriaService auditoria;
    private final ObjectMapper json;

    public EmpleadoService(EmpleadoRepository empleados, UsuarioRepository usuarios, UsuarioEventoService eventos,
                           AuditoriaService auditoria, ObjectMapper json) {
        this.empleados = empleados;
        this.usuarios = usuarios;
        this.eventos = eventos;
        this.auditoria = auditoria;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public List<ObjectNode> listar() {
        return empleados.findAll().stream().sorted(Comparator.comparing(Empleado::getId)).map(this::toDto).toList();
    }

    @Transactional
    public ObjectNode crear(JsonNode d, String actor) {
        Empleado e = new Empleado();
        String clave = d.path("id").asText("").trim();
        e.setClave(!clave.isEmpty() && empleados.findByClave(clave).isEmpty() ? clave : null);
        e.setFechaCreacion(LocalDateTime.now());
        aplicar(e, d);
        // El código (EMP-001…) lo asigna el servidor: es único en la tabla
        String codigo = d.path("code").asText("").trim();
        boolean libre = codigo.matches("EMP-\\d{3,}") && empleados.findAll().stream().noneMatch(o -> codigo.equals(o.getNumeroEmpleado()));
        e.setNumeroEmpleado(libre ? codigo : siguienteCodigo());
        Empleado guardado = empleados.saveAndFlush(e);
        if (guardado.getClave() == null) guardado.setClave("x" + guardado.getId());
        vincularCuenta(guardado);
        sincronizarCuenta(guardado);
        return toDto(guardado);
    }

    /** Reemplaza todos los datos del empleado (salarios, deducciones e historial incluidos). */
    @Transactional
    public ObjectNode actualizar(String clave, JsonNode d, String actor) {
        Empleado e = buscar(clave);
        boolean yaRetirado = "Retirado".equals(e.getEstado());
        String codigo = e.getNumeroEmpleado();
        aplicar(e, d);
        if (codigo != null) e.setNumeroEmpleado(codigo);      // el código no cambia
        vincularCuenta(e);
        sincronizarCuenta(e);
        if (!yaRetirado && "Retirado".equals(e.getEstado())) cerrarCuenta(e, actor);
        return toDto(e);
    }

    private String siguienteCodigo() {
        int n = empleados.findAll().stream().map(Empleado::getNumeroEmpleado)
                .filter(c -> c != null && c.matches("EMP-\\d+")).mapToInt(c -> Integer.parseInt(c.substring(4))).max().orElse(0);
        return String.format("EMP-%03d", n + 1);
    }

    /**
     * Empleado ↔ cuenta de usuario: si el empleado aún no tiene cuenta vinculada y existe un
     * usuario con su mismo número de documento (que no sea de otro empleado), se vinculan.
     */
    private void vincularCuenta(Empleado e) {
        if (e.getUsuarioId() != null) return;
        String doc = soloDigitos(e.getNumeroDocumento());
        if (doc.isEmpty()) return;
        Set<Long> ocupadas = new HashSet<>();
        empleados.findAll().forEach(o -> { if (o.getUsuarioId() != null && !Objects.equals(o.getId(), e.getId())) ocupadas.add(o.getUsuarioId()); });
        usuarios.findAll().stream()
                .filter(u -> doc.equals(soloDigitos(u.getCedulaIdentidad())) && !ocupadas.contains(u.getId()))
                .findFirst().ifPresent(u -> e.setUsuarioId(u.getId()));
    }

    /**
     * Usuarios y Nómina muestran a la misma persona: al guardar la ficha, su cuenta vinculada
     * queda con el mismo nombre, documento, cargo, teléfono y correo (si el correo no es de otra cuenta).
     */
    private void sincronizarCuenta(Empleado e) {
        if (e.getUsuarioId() == null) return;
        usuarios.findById(e.getUsuarioId()).ifPresent(u -> {
            u.setNombre(e.getNombre());
            u.setApellido(e.getApellido());
            if (e.getNumeroDocumento() != null && !e.getNumeroDocumento().isBlank()) u.setCedulaIdentidad(e.getNumeroDocumento());
            if (e.getCargo() != null && !e.getCargo().isBlank()) u.setCargo(e.getCargo());
            if (e.getTelefono() != null && !e.getTelefono().isBlank()) u.setTelefono(e.getTelefono());
            String email = e.getEmail();
            if (email != null && !email.isBlank() && !email.equalsIgnoreCase(u.getEmail())
                    && usuarios.findByEmailIgnoreCase(email).filter(o -> !o.getId().equals(u.getId())).isEmpty()) {
                u.setEmail(email);
            }
        });
    }

    private static String soloDigitos(String s) { return s == null ? "" : s.replaceAll("\\D", ""); }

    /**
     * Un empleado retirado (despido, renuncia...) ya no debe entrar a SOGO: su cuenta de
     * usuario (la vinculada, o la que tiene su mismo documento) pasa a Inactivo. La cuenta
     * y su historial se conservan. Nunca deja el sistema sin un administrador activo.
     */
    private void cerrarCuenta(Empleado e, String actor) {
        String doc = e.getNumeroDocumento() == null ? "" : e.getNumeroDocumento().replaceAll("\\D", "");
        String motivo = "Retiro del empleado " + e.getNumeroEmpleado() + ": " + motivoRetiro(e);
        for (Usuario u : usuarios.findAll()) {
            boolean suya = (e.getUsuarioId() != null && e.getUsuarioId().equals(u.getId()))
                    || (!doc.isEmpty() && doc.equals(u.getCedulaIdentidad() == null ? null : u.getCedulaIdentidad().replaceAll("\\D", "")));
            if (!suya || "Inactivo".equals(u.getEstado())) continue;
            String nombre = u.getUsername() != null && !u.getUsername().isBlank() ? u.getUsername() : u.getEmail();
            boolean admin = u.getRoles().stream().map(Rol::claveOId).anyMatch("admin"::equals);
            boolean otroAdmin = usuarios.findAll().stream().anyMatch(x -> !x.getId().equals(u.getId()) && "Activo".equals(x.getEstado())
                    && x.getRoles().stream().map(Rol::claveOId).anyMatch("admin"::equals));
            if (admin && !otroAdmin) {
                auditoria.registrar(new AuditoriaService.Evento(actor, "Usuarios", "No desactivó la cuenta de " + nombre,
                        "Es el único administrador activo; " + motivo, null, "Denegado", null, null, ""), null, "");
                continue;
            }
            ObjectNode cambio = json.createObjectNode();
            cambio.put("at", LocalDateTime.now().format(MINUTO));
            cambio.put("username", nombre);
            cambio.put("from", u.getEstado() == null ? "Activo" : u.getEstado());
            cambio.put("to", "Inactivo");
            cambio.put("reason", motivo);
            cambio.put("note", "Desactivada automáticamente desde Nómina");
            cambio.put("by", actor);
            eventos.registrar("estado", cambio);
            u.setEstado("Inactivo");
            u.setActivo(false);
            auditoria.registrar(new AuditoriaService.Evento(actor, "Usuarios", "Desactivó la cuenta de " + nombre + " (retiro en Nómina)",
                    motivo, "Usuario «" + nombre + "»", "Exitoso", null, motivo, ""), null, "");
        }
    }

    /**
     * Usuarios → Nómina. Una cuenta desactivada es una persona que ya no trabaja: su ficha pasa a
     * Retirado (con la fecha y el motivo) y deja de liquidarse desde ese día. Excepciones: si el
     * motivo es "Vacaciones o licencia" queda en Vacaciones (sigue en la nómina), y si es
     * "Cambio de funciones" o de seguridad sigue Activo (trabaja, pero sin acceso a SOGO).
     * Al reactivar la cuenta, quien estaba de vacaciones vuelve a Activo; un retirado no se
     * reintegra solo (en Nómina se reactiva con su nueva fecha de ingreso).
     */
    @EventListener
    @Transactional
    public void alCambiarEstadoDeCuenta(UsuarioEventoService.CambioDeEstado c) {
        if (c.motivo().startsWith("Retiro del empleado")) return;     // el cambio lo originó Nómina
        Optional<Usuario> u = usuarios.findByUsernameIgnoreCase(c.username()).or(() -> usuarios.findByEmailIgnoreCase(c.username()));
        if (u.isEmpty()) return;
        for (Empleado e : empleados.findByUsuarioId(u.get().getId())) {
            if ("Inactivo".equals(c.a())) {
                retirarPorCuenta(e, c);
            } else if ("Activo".equals(c.a()) && "Inactivo".equals(c.de()) && "Vacaciones".equals(e.getEstado())) {
                e.setEstado("Activo");
                anotar(e, "Regresa de vacaciones o licencia (cuenta reactivada en Usuarios)", c.por());
            }
        }
    }

    private void retirarPorCuenta(Empleado e, UsuarioEventoService.CambioDeEstado c) {
        String m = c.motivo();
        if ("Retirado".equals(e.getEstado()) || m.startsWith("Cambio de funciones") || m.startsWith("Seguridad")) return;
        if (m.startsWith("Vacaciones")) {
            if (!"Vacaciones".equals(e.getEstado())) {
                e.setEstado("Vacaciones");
                anotar(e, "Estado: Activo → Vacaciones (cuenta desactivada en Usuarios: " + m + ")", c.por());
            }
            return;
        }
        String razon = m.startsWith("Retiro voluntario") || m.startsWith("Renuncia") ? "Renuncia voluntaria"
                : m.startsWith("Terminación") ? "Terminación del contrato"
                : m.startsWith("Despido con") ? "Despido con justa causa"
                : m.startsWith("Despido sin") ? "Despido sin justa causa" : "Otro";
        LocalDate hoy = LocalDate.now();
        // Si aún no había empezado a trabajar, no alcanza a causar ningún día
        LocalDate retiro = e.getFechaContratacion() != null && e.getFechaContratacion().isAfter(hoy) ? e.getFechaContratacion().minusDays(1) : hoy;
        e.setEstado("Retirado");
        e.setActivo(false);
        e.setFechaTerminacion(retiro);
        e.setFechaModificacion(LocalDateTime.now());
        ObjectNode datos = leerDatos(e);
        datos.put("retirementReason", razon);
        e.setSogoDatos(datos.toString());
        anotar(e, "Retiro · " + razon + " · " + retiro.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
                + " (cuenta desactivada en Usuarios: " + m + ")", c.por());
        auditoria.registrar(new AuditoriaService.Evento(c.por(), "Nómina", "Retiró al empleado " + e.getNumeroEmpleado(),
                "Cuenta " + c.username() + " desactivada: " + m, "Empleado «" + e.getNumeroEmpleado() + "»", "Exitoso", null, m, ""), null, "");
    }

    /** Agrega una línea al historial de la ficha (lo más reciente primero). */
    private void anotar(Empleado e, String texto, String por) {
        ObjectNode datos = leerDatos(e);
        ArrayNode historial = json.createArrayNode();
        historial.addObject().put("at", LocalDateTime.now().format(MINUTO)).put("by", por).put("text", texto);
        if (datos.path("history").isArray()) datos.path("history").forEach(historial::add);
        datos.set("history", historial);
        e.setSogoDatos(datos.toString());
    }

    private ObjectNode leerDatos(Empleado e) {
        try {
            JsonNode d = e.getSogoDatos() == null ? null : json.readTree(e.getSogoDatos());
            return d instanceof ObjectNode o ? o : json.createObjectNode();
        } catch (Exception ex) {
            return json.createObjectNode();
        }
    }

    private String motivoRetiro(Empleado e) {
        try {
            return e.getSogoDatos() == null ? "retirado" : json.readTree(e.getSogoDatos()).path("retirementReason").asText("retirado");
        } catch (Exception ex) {
            return "retirado";
        }
    }

    public Empleado buscar(String clave) {
        return empleados.findByClave(clave)
                .or(() -> clave.matches("x\\d+") ? empleados.findById(Long.valueOf(clave.substring(1))) : Optional.empty())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "No existe el empleado " + clave));
    }

    private void aplicar(Empleado e, JsonNode d) {
        String nombre = d.path("firstName").asText("").trim();
        if (nombre.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Falta el nombre del empleado");
        if (d.path("hireDate").asText("").isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Falta la fecha de ingreso");

        String email = d.path("email").asText("").trim().toLowerCase();
        if (!email.isEmpty()) {
            empleados.findAll().stream().filter(o -> !Objects.equals(o.getId(), e.getId()) && email.equalsIgnoreCase(o.getEmail())).findFirst()
                    .ifPresent(o -> { throw new ResponseStatusException(CONFLICT, "El correo " + email + " ya es de otro empleado"); });
        }
        String doc = soloDigitos(d.path("docNumber").asText(""));
        if (doc.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Falta el número de documento");
        empleados.findAll().stream().filter(o -> !Objects.equals(o.getId(), e.getId()) && doc.equals(soloDigitos(o.getNumeroDocumento()))).findFirst()
                .ifPresent(o -> { throw new ResponseStatusException(CONFLICT, "El documento " + doc + " ya es del empleado " + o.getNumeroEmpleado()); });
        e.setNumeroEmpleado(d.path("code").asText(null));
        e.setNombre(nombre);
        e.setApellido(d.path("lastName").asText(""));
        e.setFechaNacimiento(fecha(d.path("birthDate").asText(null)));
        e.setTipoDocumento(d.path("docType").asText(null));
        e.setNumeroDocumento(doc);
        e.setEmail(email.isEmpty() ? null : email);
        e.setTelefono(d.path("phone").asText(""));
        e.setDireccion(d.path("address").asText(""));
        e.setCargo(d.path("position").asText(""));
        e.setDepartamento(d.path("area").asText(null));
        e.setFechaContratacion(fecha(d.path("hireDate").asText(null)));
        String estado = d.path("status").asText("Activo");
        e.setEstado(estado);
        e.setActivo(!"Retirado".equals(estado));
        e.setFechaTerminacion(fecha(d.path("retiredAt").asText(null)));
        e.setTipoContrato(d.path("contractType").asText(null));
        e.setFinContrato(fecha(d.path("contractEnd").asText(null)));
        e.setHorasSemanales(d.path("weeklyHours").isNumber() ? d.path("weeklyHours").asInt() : null);
        e.setEps(d.path("eps").asText(""));
        e.setFondoPension(d.path("pensionFund").asText(""));
        e.setArl(d.path("arl").asText(""));
        e.setRiesgoArl(d.path("arlRisk").asText("I"));
        e.setCajaCompensacion(d.path("ccf").asText(""));
        // Medio de pago: por ahora solo Nequi (celular de 10 dígitos que empieza por 3)
        String medio = d.path("bank").asText("").isBlank() ? "Nequi" : d.path("bank").asText();
        if (!"Nequi".equals(medio)) throw new ResponseStatusException(BAD_REQUEST, "Por ahora el único medio de pago es Nequi");
        String nequi = soloDigitos(d.path("accountNumber").asText(""));
        if (!nequi.isEmpty() && !nequi.matches("3\\d{9}")) throw new ResponseStatusException(BAD_REQUEST, "El número Nequi debe ser un celular de 10 dígitos que empieza por 3");
        e.setBanco(medio);
        e.setTipoCuenta("Nequi");
        e.setNumeroCuenta(nequi.isEmpty() ? null : nequi);
        e.setFechaModificacion(LocalDateTime.now());

        // Salarios por vigencia; el vigente hoy también queda en `salario` (lo lee la web)
        e.getSalarios().clear();
        Map<LocalDate, BigDecimal> porFecha = new TreeMap<>();
        for (JsonNode s : d.path("salaries")) porFecha.put(fecha(s.path("from").asText()), BigDecimal.valueOf(s.path("amount").asDouble()));
        porFecha.forEach((desde, monto) -> e.getSalarios().add(new Salario(desde, monto)));
        LocalDate hoy = LocalDate.now();
        e.setSalario(porFecha.entrySet().stream().filter(x -> !x.getKey().isAfter(hoy)).reduce((a, b) -> b)
                .or(() -> porFecha.entrySet().stream().findFirst()).map(Map.Entry::getValue).orElse(null));

        // Deducciones: se conservan las filas existentes por su clave
        Map<String, EmpleadoDeduccion> actuales = new HashMap<>();
        e.getDeducciones().forEach(x -> actuales.put(x.claveOId(), x));
        List<EmpleadoDeduccion> nuevas = new ArrayList<>();
        for (JsonNode x : d.path("deductions")) {
            String clave = x.path("id").asText("");
            EmpleadoDeduccion ded = actuales.getOrDefault(clave, new EmpleadoDeduccion());
            ded.setEmpleado(e);
            ded.setClave(clave.isEmpty() ? null : clave);
            ded.setTipo(x.path("type").asText(""));
            ded.setDescripcion(x.path("description").asText(""));
            ded.setMonto(BigDecimal.valueOf(x.path("amount").asDouble()));
            ded.setCuotas(x.path("installments").isNumber() ? x.path("installments").asInt() : null);
            ded.setDesdePeriodo(x.path("fromPeriod").asText(""));
            ded.setActiva(true);
            nuevas.add(ded);
        }
        e.getDeducciones().clear();
        e.getDeducciones().addAll(nuevas);

        ObjectNode datos = json.createObjectNode();
        datos.set("history", d.has("history") ? d.get("history") : json.createArrayNode());
        if ("Retirado".equals(estado) && d.hasNonNull("retirementReason")) datos.put("retirementReason", d.get("retirementReason").asText());
        e.setSogoDatos(datos.toString());
    }

    private ObjectNode toDto(Empleado e) {
        ObjectNode o = json.createObjectNode();
        o.put("id", e.claveOId());
        o.put("code", e.getNumeroEmpleado() == null ? "" : e.getNumeroEmpleado());
        o.put("firstName", texto(e.getNombre()));
        o.put("lastName", texto(e.getApellido()));
        o.put("birthDate", e.getFechaNacimiento() == null ? "" : e.getFechaNacimiento().toString());
        o.put("docType", texto(e.getTipoDocumento()));
        o.put("docNumber", texto(e.getNumeroDocumento()));
        o.put("email", texto(e.getEmail()));
        o.put("phone", texto(e.getTelefono()));
        o.put("address", texto(e.getDireccion()));
        o.put("position", texto(e.getCargo()));
        o.put("area", texto(e.getDepartamento()));
        o.put("hireDate", e.getFechaContratacion() == null ? "" : e.getFechaContratacion().toString());
        o.put("status", e.getEstado() == null ? "Activo" : e.getEstado());
        if (e.getFechaTerminacion() != null) o.put("retiredAt", e.getFechaTerminacion().toString());
        if ("Retirado".equals(e.getEstado())) {
            String motivo = motivoRetiro(e);
            if (!"retirado".equals(motivo)) o.put("retirementReason", motivo);
        }
        o.put("contractType", texto(e.getTipoContrato()));
        if (e.getFinContrato() != null) o.put("contractEnd", e.getFinContrato().toString());
        if (e.getHorasSemanales() == null) o.putNull("weeklyHours"); else o.put("weeklyHours", e.getHorasSemanales());
        ArrayNode salarios = o.putArray("salaries");
        e.getSalarios().forEach(s -> salarios.addObject().put("from", s.getDesde().toString()).put("amount", s.getMonto().longValue()));
        o.put("eps", texto(e.getEps()));
        o.put("pensionFund", texto(e.getFondoPension()));
        o.put("arl", texto(e.getArl()));
        o.put("arlRisk", e.getRiesgoArl() == null ? "I" : e.getRiesgoArl());
        o.put("ccf", texto(e.getCajaCompensacion()));
        o.put("bank", texto(e.getBanco()));
        o.put("accountType", e.getTipoCuenta() == null ? "Ahorros" : e.getTipoCuenta());
        o.put("accountNumber", texto(e.getNumeroCuenta()));
        // Cuenta de usuario de SOGO vinculada (la clave que usa Usuarios)
        if (e.getUsuarioId() != null) usuarios.findById(e.getUsuarioId()).ifPresent(u -> o.put("userId", u.claveOId()));
        ArrayNode deducciones = o.putArray("deductions");
        e.getDeducciones().forEach(x -> {
            ObjectNode d = deducciones.addObject();
            d.put("id", x.claveOId());
            d.put("type", texto(x.getTipo()));
            d.put("description", texto(x.getDescripcion()));
            d.put("amount", x.getMonto() == null ? 0 : x.getMonto().longValue());
            if (x.getCuotas() == null) d.putNull("installments"); else d.put("installments", x.getCuotas());
            d.put("fromPeriod", texto(x.getDesdePeriodo()));
        });
        JsonNode history = json.createArrayNode();
        try {
            if (e.getSogoDatos() != null) history = json.readTree(e.getSogoDatos()).path("history");
        } catch (Exception ignored) { }
        o.set("history", history.isArray() ? history : json.createArrayNode());
        return o;
    }

    private static LocalDate fecha(String s) {
        return s == null || s.isBlank() || "null".equals(s) ? null : LocalDate.parse(s.substring(0, 10));
    }

    private static String texto(String s) { return s == null ? "" : s; }
}
