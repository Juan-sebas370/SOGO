package com.sogo.controller;

import com.sogo.dto.ConsumoDto;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.ConsumoService;
import com.sogo.service.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/consumos")
public class ConsumoController {

    private final ConsumoService service;
    private final UserService users;

    public ConsumoController(ConsumoService service, UserService users) {
        this.service = service;
        this.users = users;
    }

    @GetMapping
    public List<ConsumoDto> listar() {
        return service.listar();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ConsumoDto crear(@RequestBody ConsumoDto body, @RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        return service.crear(body, users.findUsuario(username).map(u -> u.getId()).orElse(null));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void eliminar(@PathVariable Long id) {
        service.eliminar(id);
    }
}
