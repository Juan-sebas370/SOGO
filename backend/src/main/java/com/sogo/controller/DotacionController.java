package com.sogo.controller;

import com.sogo.dto.DotacionDto;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.DotacionService;
import com.sogo.service.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** Dotación de la casa. Todos la consultan; solo el Administrador cambia precios y cantidades. */
@RestController
@RequestMapping("/api/dotacion")
public class DotacionController {

    private final DotacionService service;
    private final UserService users;

    public DotacionController(DotacionService service, UserService users) {
        this.service = service;
        this.users = users;
    }

    @GetMapping
    public List<DotacionDto> listar() {
        return service.listar();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DotacionDto crear(@RequestBody DotacionDto body,
                             @RequestAttribute(JwtAuthFilter.USERNAME) String username,
                             @RequestAttribute(name = JwtAuthFilter.ROLE, required = false) String role) {
        exigirAdministrador(role);
        return service.crear(body, usuarioId(username));
    }

    @PutMapping("/{id}")
    public DotacionDto actualizar(@PathVariable Long id, @RequestBody DotacionDto body,
                                  @RequestAttribute(JwtAuthFilter.USERNAME) String username,
                                  @RequestAttribute(name = JwtAuthFilter.ROLE, required = false) String role) {
        exigirAdministrador(role);
        return service.actualizar(id, body, usuarioId(username));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void retirar(@PathVariable Long id,
                        @RequestAttribute(JwtAuthFilter.USERNAME) String username,
                        @RequestAttribute(name = JwtAuthFilter.ROLE, required = false) String role) {
        exigirAdministrador(role);
        service.retirar(id, usuarioId(username));
    }

    private void exigirAdministrador(String role) {
        if (!"Administrador".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Solo el administrador puede modificar la dotación");
        }
    }

    private Long usuarioId(String username) {
        return users.findUsuario(username).map(u -> u.getId()).orElse(null);
    }
}
