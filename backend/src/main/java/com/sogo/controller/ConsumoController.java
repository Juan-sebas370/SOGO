package com.sogo.controller;

import com.sogo.dto.ConsumoDto;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.ConsumoService;
import com.sogo.service.PermisoService;
import com.sogo.service.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/consumos")
public class ConsumoController {

    private static final String[] VER = { "Restaurante:view", "Facturación:view", "Alojamiento:view", "Reservas:view", "Reportes:view", "Contabilidad:view" };
    /** Los cargos a la cuenta se agregan y se quitan desde Restaurante, Facturación y el check-out. */
    private static final String[] CARGAR = { "Restaurante:create", "Restaurante:edit", "Facturación:create", "Facturación:edit", "Alojamiento:edit", "Reservas:edit" };

    private final ConsumoService service;
    private final UserService users;
    private final PermisoService permisos;

    public ConsumoController(ConsumoService service, UserService users, PermisoService permisos) {
        this.service = service;
        this.users = users;
        this.permisos = permisos;
    }

    @GetMapping
    public List<ConsumoDto> listar(@RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        permisos.exigirAlguno(username, VER);
        return service.listar();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ConsumoDto crear(@RequestBody ConsumoDto body, @RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        permisos.exigirAlguno(username, CARGAR);
        return service.crear(body, users.findUsuario(username).map(u -> u.getId()).orElse(null));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void eliminar(@PathVariable Long id, @RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        permisos.exigirAlguno(username, CARGAR);
        service.eliminar(id);
    }
}
