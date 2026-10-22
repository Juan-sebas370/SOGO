package com.sogo.controller;

import com.sogo.dto.ReservaDto;
import com.sogo.dto.ReservaDto.PagoDto;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.ReservaService;
import com.sogo.service.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/reservas")
public class ReservaController {

    private final ReservaService service;
    private final UserService users;

    public ReservaController(ReservaService service, UserService users) {
        this.service = service;
        this.users = users;
    }

    @GetMapping
    public List<ReservaDto> listar() {
        return service.listar();
    }

    @GetMapping("/{id}")
    public ReservaDto obtener(@PathVariable Long id) {
        return service.obtener(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReservaDto crear(@RequestBody ReservaDto body, @RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        return service.crear(body, usuarioId(username));
    }

    @PutMapping("/{id}")
    public ReservaDto actualizar(@PathVariable Long id, @RequestBody ReservaDto body) {
        return service.actualizar(id, body);
    }

    @PostMapping("/{id}/pagos")
    public ReservaDto registrarPago(@PathVariable Long id, @RequestBody PagoDto body,
                                    @RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        return service.registrarPago(id, body, usuarioId(username));
    }

    private Long usuarioId(String username) {
        return users.findUsuario(username).map(u -> u.getId()).orElse(null);
    }
}
