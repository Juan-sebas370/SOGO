package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.entity.Empleado;
import com.sogo.entity.Rol;
import com.sogo.entity.Usuario;
import com.sogo.repository.EmpleadoRepository;
import com.sogo.repository.UsuarioRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

import static org.springframework.http.HttpStatus.*;

/**
 * Cuentas del personal con la forma de `AppUser` del frontend (users.model.ts), sobre
 * la tabla `usuarios`. La contraseña se guarda con BCrypt (la misma que usa el login de
 * SOGO y el de la web) y nunca sale del servidor.
 */
@Service
public class CuentaService {

    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    private static final List<String> ESTADOS = List.of("Activo", "Pendiente", "Bloqueado", "Inactivo");

    private final UsuarioRepository usuarios;
    private final EmpleadoRepository empleados;
    private final RolService roles;
    private final ObjectMapper json;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public CuentaService(UsuarioRepository usuarios, EmpleadoRepository empleados, RolService roles, ObjectMapper json) {
        this.usuarios = usuarios;
        this.empleados = empleados;
        this.roles = roles;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public List<ObjectNode> listar() {
        Map<Long, String> empleadoDe = new HashMap<>();
        empleados.findAll().forEach(e -> { if (e.getUsuarioId() != null) empleadoDe.put(e.getUsuarioId(), e.claveOId()); });
        return usuarios.findAll().stream().sorted(Comparator.comparing(Usuario::getId)).map(u -> toDto(u, empleadoDe.get(u.getId()))).toList();
    }

    /** body: { user: AppUser, password, mustChange, status } */
    @Transactional
    public ObjectNode crear(JsonNode body, String actor) {
        JsonNode d = body.path("user");
        String password = body.path("password").asText("");
        if (password.length() < 8) throw new ResponseStatusException(BAD_REQUEST, "La contraseña debe tener al menos 8 caracteres");
        String estado = body.path("status").asText("Activo");
        if (!List.of("Activo", "Pendiente").contains(estado)) throw new ResponseStatusException(BAD_REQUEST, "Estado inicial no válido");

        Usuario u = new Usuario();
        String clave = d.path("id").asText("").trim();
        u.setClave(!clave.isEmpty() && usuarios.findByClave(clave).isEmpty() ? clave : null);
        aplicar(u, d);
        u.setEstado(estado);
        u.setActivo(true);
        u.setProveedorAuth("local");
        u.setPassword(encoder.encode(password));
        u.setPasswordActualizadaAt(LocalDateTime.now());
        u.setDebeCambiarPassword(body.path("mustChange").asBoolean(true));
        u.setIntentosFallidos(0);
        u.setFechaRegistro(LocalDateTime.now());
        u.setActivacionExpiraAt(fechaHora(d.path("activationExpires").asText(null)));
        ObjectNode datos = json.createObjectNode();
        datos.put("createdBy", actor);
        datos.set("history", d.has("history") ? d.get("history") : json.createArrayNode());
        u.setSogoDatos(datos.toString());
        Usuario guardado = usuarios.saveAndFlush(u);
        if (guardado.getClave() == null) guardado.setClave("w" + guardado.getId());
        vincularEmpleado(guardado, d.path("employeeId").asText(null));
        return toDto(guardado, d.path("employeeId").asText(null));
    }

    /** Reemplaza datos, roles, estado e historial (la contraseña va aparte, en cambiarClave). */
    @Transactional
    public ObjectNode actualizar(String clave, JsonNode d) {
        Usuario u = buscar(clave);
        aplicar(u, d);
        if (d.has("status")) {
            String estado = d.path("status").asText();
            if (!ESTADOS.contains(estado)) throw new ResponseStatusException(BAD_REQUEST, "Estado no válido: " + estado);
            u.setEstado(estado);
            u.setActivo(!"Inactivo".equals(estado));
        }
        if (d.has("failedAttempts")) u.setIntentosFallidos(d.path("failedAttempts").asInt(0));
        if (d.has("mustChangePassword")) u.setDebeCambiarPassword(d.path("mustChangePassword").asBoolean());
        if (d.has("activationExpires")) u.setActivacionExpiraAt(fechaHora(d.path("activationExpires").asText(null)));
        ObjectNode datos = leerDatos(u);
        if (d.has("history")) datos.set("history", d.get("history"));
        if (d.hasNonNull("scheduledDeactivation")) datos.set("scheduledDeactivation", d.get("scheduledDeactivation"));
        else datos.remove("scheduledDeactivation");
        u.setSogoDatos(datos.toString());
        exigirAdministradorActivo();
        if (d.has("employeeId")) vincularEmpleado(u, d.path("employeeId").asText(null));
        // La ficha de Nómina de la misma persona queda con los mismos datos de la cuenta
        empleados.findByUsuarioId(u.getId()).forEach(e -> {
            if (u.getNombre() != null && !u.getNombre().isBlank()) e.setNombre(u.getNombre());
            if (u.getApellido() != null) e.setApellido(u.getApellido());
            if (u.getCedulaIdentidad() != null && !u.getCedulaIdentidad().isBlank()) e.setNumeroDocumento(u.getCedulaIdentidad());
            if (u.getCargo() != null && !u.getCargo().isBlank()) e.setCargo(u.getCargo());
            if (u.getTelefono() != null && !u.getTelefono().isBlank()) e.setTelefono(u.getTelefono());
            if (u.getEmail() != null && !u.getEmail().isBlank()) e.setEmail(u.getEmail());
        });
        return toDto(u, empleados.findByUsuarioId(u.getId()).stream().findFirst().map(Empleado::claveOId).orElse(null));
    }

    /** Restablece la contraseña (definida por el administrador o temporal). */
    @Transactional
    public void cambiarClave(String clave, String password, boolean mustChange, boolean desbloquear) {
        if (password == null || password.length() < 8) throw new ResponseStatusException(BAD_REQUEST, "La contraseña debe tener al menos 8 caracteres");
        Usuario u = buscar(clave);
        u.setPassword(encoder.encode(password));
        u.setPasswordActualizadaAt(LocalDateTime.now());
        u.setDebeCambiarPassword(mustChange);
        u.setIntentosFallidos(0);
        if (desbloquear && "Bloqueado".equals(u.getEstado())) {
            u.setEstado("Activo");
            u.setActivo(true);
        }
    }

    public Usuario buscar(String clave) {
        return usuarios.findByClave(clave)
                .or(() -> clave.matches("w\\d+") ? usuarios.findById(Long.valueOf(clave.substring(1))) : Optional.empty())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "No existe el usuario " + clave));
    }

    private void aplicar(Usuario u, JsonNode d) {
        if (d.has("firstName")) u.setNombre(d.path("firstName").asText("").trim());
        if (d.has("lastName")) u.setApellido(d.path("lastName").asText("").trim());
        if (d.has("username")) {
            String username = d.path("username").asText("").trim().toLowerCase();
            if (username.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Falta el nombre de usuario");
            usuarios.findByUsernameIgnoreCase(username).filter(o -> !o.getId().equals(u.getId()))
                    .ifPresent(o -> { throw new ResponseStatusException(CONFLICT, "El usuario " + username + " ya existe"); });
            u.setUsername(username);
        }
        if (d.has("email")) {
            String email = d.path("email").asText("").trim().toLowerCase();
            if (email.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Falta el correo");
            usuarios.findByEmailIgnoreCase(email).filter(o -> !o.getId().equals(u.getId()))
                    .ifPresent(o -> { throw new ResponseStatusException(CONFLICT, "El correo " + email + " ya está registrado"); });
            u.setEmail(email);
        }
        if (d.has("docType")) u.setTipoDocumento(d.path("docType").asText(null));
        if (d.has("docNumber")) u.setCedulaIdentidad(d.path("docNumber").asText("").replaceAll("\\D", ""));
        if (d.has("phone")) u.setTelefono(d.path("phone").asText(""));
        if (d.has("position")) u.setCargo(d.path("position").asText(""));
        if (d.has("roles")) {
            u.getRoles().clear();
            for (JsonNode r : d.path("roles")) u.getRoles().add(roles.buscar(r.asText()));
            boolean admin = u.getRoles().stream().anyMatch(r -> "admin".equals(r.claveOId()));
            // Los administradores de SOGO también administran la página web
            u.setRol(admin ? "ADMIN" : "USER");
        }
    }

    /** Nunca queda el sistema sin un administrador activo. */
    private void exigirAdministradorActivo() {
        boolean hay = usuarios.findAll().stream().anyMatch(x -> "Activo".equals(x.getEstado())
                && x.getRoles().stream().map(Rol::claveOId).anyMatch("admin"::equals));
        if (!hay) throw new ResponseStatusException(CONFLICT, "El sistema quedaría sin un administrador activo");
    }

    private void vincularEmpleado(Usuario u, String claveEmpleado) {
        empleados.findByUsuarioId(u.getId()).forEach(e -> {
            if (!e.claveOId().equals(claveEmpleado)) e.setUsuarioId(null);
        });
        if (claveEmpleado != null && !claveEmpleado.isBlank()) {
            empleados.findByClave(claveEmpleado).ifPresent(e -> e.setUsuarioId(u.getId()));
        }
    }

    private ObjectNode toDto(Usuario u, String empleado) {
        ObjectNode datos = leerDatos(u);
        ObjectNode o = json.createObjectNode();
        o.put("id", u.claveOId());
        o.put("firstName", texto(u.getNombre()));
        o.put("lastName", texto(u.getApellido()));
        o.put("username", u.getUsername() != null && !u.getUsername().isBlank() ? u.getUsername() : texto(u.getEmail()));
        o.put("email", texto(u.getEmail()));
        o.put("docType", u.getTipoDocumento() == null ? "CC" : u.getTipoDocumento());
        o.put("docNumber", texto(u.getCedulaIdentidad()).replaceAll("\\D", ""));
        o.put("phone", texto(u.getTelefono()));
        o.put("position", texto(u.getCargo()));
        if (empleado != null) o.put("employeeId", empleado);
        ArrayNode rs = o.putArray("roles");
        PermisoService.clavesDe(u).forEach(rs::add);
        o.put("status", u.getEstado() == null ? (Boolean.FALSE.equals(u.getActivo()) ? "Inactivo" : "Activo") : u.getEstado());
        o.put("createdAt", u.getFechaRegistro() == null ? "" : u.getFechaRegistro().format(MINUTO));
        o.put("createdBy", datos.path("createdBy").asText("sistema"));
        if (u.getUltimaConexion() == null) o.putNull("lastAccess"); else o.put("lastAccess", u.getUltimaConexion().format(MINUTO));
        o.put("lastIp", texto(u.getUltimaIp()));
        o.put("passwordHash", "");   // nunca se envía
        o.put("passwordSetAt", u.getPasswordActualizadaAt() == null ? "" : u.getPasswordActualizadaAt().format(MINUTO));
        o.put("mustChangePassword", Boolean.TRUE.equals(u.getDebeCambiarPassword()));
        o.put("failedAttempts", u.getIntentosFallidos() == null ? 0 : u.getIntentosFallidos());
        if (u.getActivacionExpiraAt() != null) o.put("activationExpires", u.getActivacionExpiraAt().format(MINUTO));
        if (datos.hasNonNull("scheduledDeactivation")) o.set("scheduledDeactivation", datos.get("scheduledDeactivation"));
        o.set("history", datos.has("history") ? datos.get("history") : json.createArrayNode());
        return o;
    }

    private ObjectNode leerDatos(Usuario u) {
        try {
            JsonNode d = u.getSogoDatos() == null ? null : json.readTree(u.getSogoDatos());
            return d instanceof ObjectNode o ? o : json.createObjectNode();
        } catch (Exception e) {
            return json.createObjectNode();
        }
    }

    private static LocalDateTime fechaHora(String s) {
        if (s == null || s.isBlank() || "null".equals(s)) return null;
        return LocalDateTime.parse(s.length() > 16 ? s.substring(0, 16) : s, MINUTO);
    }

    private static String texto(String s) { return s == null ? "" : s; }
}
