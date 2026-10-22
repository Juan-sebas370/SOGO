package com.sogo.service;

import com.sogo.entity.Rol;
import com.sogo.entity.Usuario;
import com.sogo.repository.RolRepository;
import com.sogo.repository.UsuarioRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

import static org.springframework.http.HttpStatus.FORBIDDEN;

/**
 * Permisos efectivos de la sesión, igual que en el frontend: unión de los roles del
 * usuario, cada uno con lo heredado de su rol padre. El servidor los verifica antes
 * de guardar, así un cambio no depende solo de que la pantalla oculte un botón.
 */
@Service
public class PermisoService {

    public static final List<String> MODULOS = List.of(
            "Reservas", "Alojamiento", "TRA", "Facturación", "Restaurante", "Inventarios",
            "Reportes", "Nómina", "Contabilidad", "Mensajes", "Usuarios", "Configuración");

    private final UsuarioRepository usuarios;
    private final RolRepository roles;

    public PermisoService(UsuarioRepository usuarios, RolRepository roles) {
        this.usuarios = usuarios;
        this.roles = roles;
    }

    @Transactional(readOnly = true)
    public Optional<Usuario> usuario(String login) {
        if (login == null || login.isBlank()) return Optional.empty();
        return usuarios.findByUsernameIgnoreCase(login.trim()).or(() -> usuarios.findByEmailIgnoreCase(login.trim()));
    }

    @Transactional(readOnly = true)
    public Long usuarioId(String login) {
        return usuario(login).map(Usuario::getId).orElse(null);
    }

    /** Nombre de la persona de la sesión (como lo muestra SOGO: «Nombre Apellido»). */
    @Transactional(readOnly = true)
    public String nombre(String login) {
        return usuario(login).map(u -> {
            String n = ((u.getNombre() == null ? "" : u.getNombre()) + " " + (u.getApellido() == null ? "" : u.getApellido())).trim();
            return n.isEmpty() ? (u.getUsername() != null && !u.getUsername().isBlank() ? u.getUsername() : u.getEmail()) : n;
        }).orElse(login == null ? "sistema" : login);
    }

    /** Claves de rol de un usuario; una cuenta ADMIN de la web sin roles de SOGO cuenta como Administrador. */
    public static List<String> clavesDe(Usuario u) {
        List<String> claves = u.getRoles().stream().map(Rol::claveOId).toList();
        return claves.isEmpty() && "ADMIN".equalsIgnoreCase(u.getRol()) ? List.of("admin") : claves;
    }

    @Transactional(readOnly = true)
    public boolean puede(String login, String modulo, String accion) {
        Optional<Usuario> u = usuario(login);
        if (u.isEmpty()) return false;
        Map<Long, Rol> porId = new HashMap<>();
        Map<String, Rol> porClave = new HashMap<>();
        roles.findAll().forEach(r -> { porId.put(r.getId(), r); porClave.put(r.claveOId(), r); });
        for (String clave : clavesDe(u.get())) {
            Set<Long> vistos = new HashSet<>();
            for (Rol r = porClave.get(clave); r != null && vistos.add(r.getId()); r = r.getRolPadreId() == null ? null : porId.get(r.getRolPadreId())) {
                boolean ok = r.getPermisos().stream().anyMatch(p -> modulo.equals(p.getModulo()) && p.permite(accion));
                if (ok) return true;
            }
        }
        return false;
    }

    public void exigir(String login, String modulo, String accion) {
        if (!puede(login, modulo, accion)) {
            throw new ResponseStatusException(FORBIDDEN, "Tu rol no tiene permiso para esta acción (" + modulo + ")");
        }
    }
}
