package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.entity.Rol;
import com.sogo.entity.Usuario;
import com.sogo.model.User;
import com.sogo.repository.UsuarioRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.Optional;
import java.util.UUID;

/**
 * Inicio de sesión del personal sobre la tabla `usuarios` (la misma que usa la web;
 * ambas guardan la contraseña con BCrypt). Aplica las reglas de la política de
 * seguridad (Configuración › Seguridad): bloqueo por intentos fallidos, desbloqueo
 * automático, activación en el primer ingreso y desactivaciones programadas.
 */
@Service
public class UserService {

    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    /** Resultado del login: el usuario, o el motivo del rechazo para mostrarlo. */
    public record Ingreso(User user, String motivo) {
        public boolean ok() { return user != null; }
    }

    private final UsuarioRepository usuarios;
    private final AuditoriaService auditoria;
    private final UsuarioEventoService eventos;
    private final ConfiguracionService config;
    private final ObjectMapper json;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public UserService(UsuarioRepository usuarios, AuditoriaService auditoria, UsuarioEventoService eventos,
                       ConfiguracionService config, ObjectMapper json) {
        this.usuarios = usuarios;
        this.auditoria = auditoria;
        this.eventos = eventos;
        this.config = config;
        this.json = json;
    }

    /** Busca por nombre de usuario o por correo (el login acepta los dos). */
    public Optional<Usuario> findUsuario(String login) {
        if (login == null || login.isBlank()) return Optional.empty();
        String l = login.trim();
        return usuarios.findByUsernameIgnoreCase(l).or(() -> usuarios.findByEmailIgnoreCase(l));
    }

    @Transactional
    public Ingreso authenticate(String login, String rawPassword, String ip) {
        Optional<Usuario> found = findUsuario(login);
        if (found.isEmpty()) {
            registrar(login == null ? "—" : login.trim(), null, "Inicio de sesión · usuario desconocido", "", "Fallido", ip);
            return new Ingreso(null, "credenciales");
        }
        Usuario u = found.get();
        String nombre = nombreDe(u);
        aplicarProgramados(u, ip);

        if (u.getPassword() == null || !encoder.matches(rawPassword, u.getPassword())) {
            int intentos = (u.getIntentosFallidos() == null ? 0 : u.getIntentosFallidos()) + 1;
            u.setIntentosFallidos(intentos);
            int maximo = config.entero("seguridad", "maxAttempts", 5);
            if ("Activo".equals(u.getEstado()) && intentos >= maximo) {
                cambiarEstado(u, "Bloqueado", intentos + " intentos fallidos de contraseña (automático)", "Sistema");
                registrar(nombre, u.getId(), "Inicio de sesión (" + intentos + ".º intento) · cuenta bloqueada", "", "Fallido", ip);
            } else {
                registrar(nombre, u.getId(), "Inicio de sesión · contraseña incorrecta", "", "Fallido", ip);
            }
            return new Ingreso(null, "credenciales");
        }

        String motivo = motivoRechazo(u);
        if (motivo != null) {
            registrar(nombre, u.getId(), "Inicio de sesión rechazado", "Cuenta " + motivo, "Denegado", ip);
            return new Ingreso(null, motivo);
        }
        if ("Pendiente".equals(u.getEstado())) {
            cambiarEstado(u, "Activo", "Activación en el primer inicio de sesión", "Sistema");
            u.setActivacionExpiraAt(null);
        }
        u.setIntentosFallidos(0);
        u.setUltimaConexion(LocalDateTime.now());
        u.setUltimaIp(ip);
        registrar(nombre, u.getId(), "Inició sesión", "", "Exitoso", ip);
        return new Ingreso(toUser(u), null);
    }

    /**
     * Login social (Google o Microsoft): solo para correos que ya son cuentas del personal; nunca
     * crea cuentas. Aplica las mismas reglas que el login con contraseña (bloqueada, desactivada,
     * activación vencida, sin rol) y deja la misma constancia en la auditoría.
     * motivo: no-registrado | bloqueada | desactivada | con activación vencida | sin acceso a SOGO
     */
    @Transactional
    public Ingreso authenticateOAuth(String email, String proveedor, String ip) {
        Optional<Usuario> found = usuarios.findByEmailIgnoreCase(email == null ? "" : email.trim());
        if (found.isEmpty()) {
            registrar(email, null, "Inicio de sesión con " + proveedor + " · correo sin cuenta en SOGO", "", "Fallido", ip);
            return new Ingreso(null, "no-registrado");
        }
        Usuario u = found.get();
        String nombre = nombreDe(u);
        aplicarProgramados(u, ip);
        String motivo = motivoRechazo(u);
        if (motivo != null) {
            registrar(nombre, u.getId(), "Inicio de sesión con " + proveedor + " rechazado", "Cuenta " + motivo, "Denegado", ip);
            return new Ingreso(null, motivo);
        }
        if ("Pendiente".equals(u.getEstado())) {
            cambiarEstado(u, "Activo", "Activación en el primer inicio de sesión", "Sistema");
            u.setActivacionExpiraAt(null);
        }
        u.setIntentosFallidos(0);
        u.setUltimaConexion(LocalDateTime.now());
        u.setUltimaIp(ip);
        registrar(nombre, u.getId(), "Inició sesión con " + proveedor, "", "Exitoso", ip);
        return new Ingreso(toUser(u), null);
    }

    public Optional<Usuario> findByEmail(String email) {
        return usuarios.findByEmailIgnoreCase(email);
    }

    @Transactional
    public String createResetTokenFor(Usuario u) {
        String reset = UUID.randomUUID().toString();
        u.setResetToken(sha256(reset));   // en la base va el hash (como en la página web); el enlace lleva el token
        u.setResetTokenExpiry(LocalDateTime.now().plusHours(1));
        usuarios.save(u);
        return reset;
    }

    @Transactional
    public boolean resetPassword(String token, String newPassword) {
        Optional<Usuario> found = usuarios.findByResetToken(sha256(token));
        if (found.isEmpty()) return false;
        Usuario u = found.get();
        if (u.getResetTokenExpiry() == null || u.getResetTokenExpiry().isBefore(LocalDateTime.now())) return false;
        u.setPassword(encoder.encode(newPassword));
        u.setPasswordActualizadaAt(LocalDateTime.now());
        u.setDebeCambiarPassword(false);
        u.setResetToken(null);
        u.setResetTokenExpiry(null);
        return true;
    }

    private static String sha256(String s) {
        try {
            byte[] d = java.security.MessageDigest.getInstance("SHA-256").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder r = new StringBuilder();
            for (byte b : d) r.append(String.format("%02x", b));
            return r.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** null si puede entrar; si no, por qué (bloqueada, desactivada, sin acceso…). */
    private String motivoRechazo(Usuario u) {
        String estado = u.getEstado() == null ? "Activo" : u.getEstado();
        if ("Bloqueado".equals(estado)) return "bloqueada";
        if ("Inactivo".equals(estado) || Boolean.FALSE.equals(u.getActivo())) return "desactivada";
        if ("Pendiente".equals(estado) && u.getActivacionExpiraAt() != null && u.getActivacionExpiraAt().isBefore(LocalDateTime.now())) {
            return "con activación vencida";
        }
        return rolPrincipal(u) == null ? "sin acceso a SOGO" : null;
    }

    /** Desactivación programada vencida y desbloqueo automático por tiempo. */
    private void aplicarProgramados(Usuario u, String ip) {
        ObjectNode datos = leerDatos(u);
        JsonNode prog = datos.path("scheduledDeactivation");
        if (prog.hasNonNull("at") && !"Inactivo".equals(u.getEstado())
                && !LocalDateTime.parse(prog.get("at").asText().substring(0, 16), MINUTO).isAfter(LocalDateTime.now())) {
            cambiarEstado(u, "Inactivo", prog.path("reason").asText("Desactivación programada"), prog.path("by").asText("sistema") + " (programado)");
            u.setActivo(false);
            datos.remove("scheduledDeactivation");
            u.setSogoDatos(datos.toString());
            registrar("sistema", null, "Desactivó la cuenta de " + nombreDe(u) + " (programado)", prog.path("reason").asText(""), "Exitoso", ip);
        }
        int minutos = config.entero("seguridad", "autoUnlockMinutes", 30);
        if ("Bloqueado".equals(u.getEstado()) && minutos > 0) {
            JsonNode ultimo = eventos.ultimoCambioDeEstado(nombreDe(u));
            if (ultimo != null && "Bloqueado".equals(ultimo.path("to").asText()) && "Sistema".equals(ultimo.path("by").asText())
                    && !LocalDateTime.parse(ultimo.path("at").asText().substring(0, 16), MINUTO).plusMinutes(minutos).isAfter(LocalDateTime.now())) {
                cambiarEstado(u, "Activo", "Desbloqueo automático tras " + minutos + " min", "Sistema");
                u.setIntentosFallidos(0);
                registrar("sistema", null, "Desbloqueó automáticamente a " + nombreDe(u), minutos + " min después del bloqueo", "Exitoso", ip);
            }
        }
    }

    private void cambiarEstado(Usuario u, String a, String motivo, String por) {
        ObjectNode d = json.createObjectNode();
        d.put("at", LocalDateTime.now().format(MINUTO));
        d.put("username", nombreDe(u));
        d.put("from", u.getEstado() == null ? "Activo" : u.getEstado());
        d.put("to", a);
        d.put("reason", motivo);
        d.put("note", "");
        d.put("by", por);
        eventos.registrar("estado", d);
        u.setEstado(a);
    }

    private void registrar(String user, Long usuarioId, String accion, String detalle, String resultado, String ip) {
        auditoria.registrar(new AuditoriaService.Evento(user, "Sesión", accion, detalle, null, resultado, null, null, ""), usuarioId, ip);
    }

    /** Rol que se envía al frontend: el de mayor nivel entre los de SOGO; ADMIN de la web = Administrador. */
    private String rolPrincipal(Usuario u) {
        Optional<Rol> rol = u.getRoles().stream().min(Comparator.comparingInt(r -> switch (String.valueOf(r.getNivel())) {
            case "Total" -> 0;
            case "Operador" -> 1;
            default -> 2;
        }));
        if (rol.isPresent()) return rol.get().getNombre();
        return "ADMIN".equalsIgnoreCase(u.getRol()) ? "Administrador" : null;
    }

    private ObjectNode leerDatos(Usuario u) {
        try {
            JsonNode d = u.getSogoDatos() == null ? null : json.readTree(u.getSogoDatos());
            return d instanceof ObjectNode o ? o : json.createObjectNode();
        } catch (Exception e) {
            return json.createObjectNode();
        }
    }

    private static String nombreDe(Usuario u) {
        return u.getUsername() != null && !u.getUsername().isBlank() ? u.getUsername() : u.getEmail();
    }

    private User toUser(Usuario u) {
        String username = nombreDe(u);
        String fullName = u.getNombreCompleto().isEmpty() ? username : u.getNombreCompleto();
        return new User(u.getId(), username, u.getEmail(), fullName, rolPrincipal(u));
    }
}
