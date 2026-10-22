package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.entity.Rol;
import com.sogo.entity.Rol.Permiso;
import com.sogo.entity.Usuario;
import com.sogo.repository.RolRepository;
import com.sogo.repository.UsuarioRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.*;

/** Roles y permisos (tablas `roles` y `rol_permisos`) con la forma de `Role` del frontend. */
@Service
public class RolService {

    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    private static final List<String> ACCIONES = List.of("view", "create", "edit", "delete", "export");
    private static final List<String> PROTEGIDOS = List.of("Usuarios", "Configuración");

    private final RolRepository roles;
    private final UsuarioRepository usuarios;
    private final ObjectMapper json;

    public RolService(RolRepository roles, UsuarioRepository usuarios, ObjectMapper json) {
        this.roles = roles;
        this.usuarios = usuarios;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public List<ObjectNode> listar() {
        Map<Long, Rol> porId = roles.findAll().stream().collect(Collectors.toMap(Rol::getId, r -> r));
        Map<Long, String> nombres = usuarios.findAll().stream().collect(Collectors.toMap(Usuario::getId, this::nombreUsuario));
        return porId.values().stream().sorted(Comparator.comparing(Rol::getId)).map(r -> toDto(r, porId, nombres)).toList();
    }

    @Transactional
    public ObjectNode crear(JsonNode d, Long usuarioId) {
        Rol r = new Rol();
        r.setBloqueado(false);
        r.setColor(d.path("color").asText("custom"));
        aplicar(r, d, usuarioId);
        // La clave la propone el frontend (id estable); si ya existe, se usa r<id>
        String propuesta = d.path("id").asText("").trim();
        if (!propuesta.isEmpty() && roles.findByClave(propuesta).isEmpty()) r.setClave(propuesta);
        Rol guardado = roles.saveAndFlush(r);
        if (guardado.getClave() == null) guardado.setClave("r" + guardado.getId());
        return dtoDe(guardado.claveOId());
    }

    private ObjectNode dtoDe(String clave) {
        return listar().stream().filter(x -> x.path("id").asText().equals(clave)).findFirst().orElseThrow();
    }

    @Transactional
    public ObjectNode actualizar(String clave, JsonNode d, Long usuarioId) {
        Rol r = buscar(clave);
        // El Administrador nunca pierde Usuarios ni Configuración: el sistema quedaría sin quién lo administre
        if (Boolean.TRUE.equals(r.getBloqueado()) && d.has("permissions")) {
            for (String m : PROTEGIDOS) {
                for (String a : ACCIONES) {
                    if (!d.path("permissions").path(m).path(a).asBoolean(false)) {
                        throw new ResponseStatusException(BAD_REQUEST, "«" + r.getNombre() + "» no puede perder permisos sobre " + m);
                    }
                }
            }
        }
        if (Boolean.TRUE.equals(r.getBloqueado()) && d.hasNonNull("name") && !d.get("name").asText().trim().equals(r.getNombre())) {
            throw new ResponseStatusException(BAD_REQUEST, "El rol «" + r.getNombre() + "» no se puede renombrar");
        }
        aplicar(r, d, usuarioId);
        roles.flush();
        return dtoDe(r.claveOId());
    }

    @Transactional
    public void eliminar(String clave) {
        Rol r = buscar(clave);
        if (Boolean.TRUE.equals(r.getBloqueado())) throw new ResponseStatusException(BAD_REQUEST, "«" + r.getNombre() + "» es un rol crítico protegido");
        List<String> titulares = usuarios.findAll().stream().filter(u -> u.getRoles().stream().anyMatch(x -> x.getId().equals(r.getId())))
                .map(this::nombreUsuario).toList();
        if (!titulares.isEmpty()) throw new ResponseStatusException(CONFLICT, "No se puede eliminar: lo tienen asignado " + String.join(", ", titulares));
        List<String> hijos = roles.findAll().stream().filter(x -> r.getId().equals(x.getRolPadreId())).map(Rol::getNombre).toList();
        if (!hijos.isEmpty()) throw new ResponseStatusException(CONFLICT, "No se puede eliminar: " + String.join(", ", hijos) + " hereda(n) de este rol");
        roles.delete(r);
    }

    public Rol buscar(String clave) {
        return roles.findByClave(clave)
                .or(() -> clave.matches("r\\d+") ? roles.findById(Long.valueOf(clave.substring(1))) : Optional.empty())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "No existe el rol " + clave));
    }

    private void aplicar(Rol r, JsonNode d, Long usuarioId) {
        String nombre = d.path("name").asText(r.getNombre() == null ? "" : r.getNombre()).trim();
        if (nombre.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Falta el nombre del rol");
        boolean repetido = roles.findAll().stream().anyMatch(x -> !x.getId().equals(r.getId()) && x.getNombre().equalsIgnoreCase(nombre));
        if (repetido) throw new ResponseStatusException(CONFLICT, "Ya existe un rol con ese nombre");
        r.setNombre(nombre);
        if (d.has("description")) r.setDescripcion(d.path("description").asText(""));
        if (d.has("level")) r.setNivel(d.path("level").asText("Operador"));
        if (d.has("color")) r.setColor(d.path("color").asText("custom"));
        if (d.has("parent")) {
            String padre = d.path("parent").isNull() ? null : d.path("parent").asText(null);
            if (padre == null || padre.isBlank()) r.setRolPadreId(null);
            else {
                Rol p = buscar(padre);
                if (r.getId() != null && heredaDe(p, r.getId())) throw new ResponseStatusException(BAD_REQUEST, "Ese rol padre crearía un ciclo de herencia");
                r.setRolPadreId(p.getId());
            }
        }
        if (d.has("permissions") || d.has("scope")) {
            Map<String, String> alcances = new HashMap<>();
            r.getPermisos().forEach(p -> alcances.put(p.getModulo(), p.getAlcance()));
            JsonNode scope = d.path("scope");
            JsonNode perms = d.has("permissions") ? d.path("permissions") : permisosComoJson(r);
            r.getPermisos().clear();
            for (String m : PermisoService.MODULOS) {
                JsonNode p = perms.path(m);
                String alcance = scope.hasNonNull(m) ? scope.get(m).asText() : (d.has("scope") ? null : alcances.get(m));
                boolean algo = ACCIONES.stream().anyMatch(a -> p.path(a).asBoolean(false));
                if (algo || alcance != null) {
                    r.getPermisos().add(new Permiso(m, p.path("view").asBoolean(false), p.path("create").asBoolean(false),
                            p.path("edit").asBoolean(false), p.path("delete").asBoolean(false), p.path("export").asBoolean(false), alcance));
                }
            }
        }
        r.setFechaModificacion(LocalDateTime.now());
        r.setModificadoPor(usuarioId);
    }

    private boolean heredaDe(Rol desde, Long ancestroId) {
        Set<Long> vistos = new HashSet<>();
        for (Rol x = desde; x != null && vistos.add(x.getId()); x = x.getRolPadreId() == null ? null : roles.findById(x.getRolPadreId()).orElse(null)) {
            if (x.getId().equals(ancestroId)) return true;
        }
        return false;
    }

    private ObjectNode permisosComoJson(Rol r) {
        ObjectNode o = json.createObjectNode();
        for (String m : PermisoService.MODULOS) {
            ObjectNode p = o.putObject(m);
            Permiso permiso = r.getPermisos().stream().filter(x -> m.equals(x.getModulo())).findFirst().orElse(null);
            for (String a : ACCIONES) p.put(a, permiso != null && permiso.permite(a));
        }
        return o;
    }

    private ObjectNode toDto(Rol r, Map<Long, Rol> porId, Map<Long, String> nombres) {
        ObjectNode o = json.createObjectNode();
        o.put("id", r.claveOId());
        o.put("name", r.getNombre());
        o.put("description", r.getDescripcion() == null ? "" : r.getDescripcion());
        o.put("level", r.getNivel() == null ? "Operador" : r.getNivel());
        o.put("color", r.getColor() == null ? "custom" : r.getColor());
        Rol padre = r.getRolPadreId() == null ? null : porId.get(r.getRolPadreId());
        if (padre == null) o.putNull("parent"); else o.put("parent", padre.claveOId());
        o.set("permissions", permisosComoJson(r));
        ObjectNode scope = o.putObject("scope");
        r.getPermisos().stream().filter(p -> p.getAlcance() != null).forEach(p -> scope.put(p.getModulo(), p.getAlcance()));
        o.put("locked", Boolean.TRUE.equals(r.getBloqueado()));
        o.put("updatedAt", r.getFechaModificacion() == null ? "" : r.getFechaModificacion().format(MINUTO));
        o.put("updatedBy", r.getModificadoPor() == null ? "sistema" : nombres.getOrDefault(r.getModificadoPor(), "sistema"));
        return o;
    }

    private String nombreUsuario(Usuario u) {
        return u.getUsername() != null && !u.getUsername().isBlank() ? u.getUsername() : u.getEmail();
    }
}
