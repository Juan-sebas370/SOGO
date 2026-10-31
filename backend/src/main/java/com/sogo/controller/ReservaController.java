package com.sogo.controller;

import com.sogo.dto.ReservaDto;
import com.sogo.dto.ReservaDto.PagoDto;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.PermisoService;
import com.sogo.service.ReservaService;
import com.sogo.service.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/reservas")
public class ReservaController {

    /** Las reservas tienen datos personales; las consultan los módulos que trabajan sobre ellas. */
    private static final String[] VER = { "Reservas:view", "Alojamiento:view", "TRA:view", "Facturación:view", "Restaurante:view", "Reportes:view", "Contabilidad:view" };
    /** Check-in y check-out (Alojamiento), facturas y cargos a la cuenta (Facturación, Restaurante) también la actualizan. */
    private static final String[] EDITAR = { "Reservas:edit", "Alojamiento:edit", "Facturación:create", "Facturación:edit", "Restaurante:create", "Restaurante:edit" };
    private static final String[] PAGAR = { "Reservas:edit", "Alojamiento:edit", "Facturación:create", "Facturación:edit" };

    private final ReservaService service;
    private final UserService users;
    private final PermisoService permisos;

    public ReservaController(ReservaService service, UserService users, PermisoService permisos) {
        this.service = service;
        this.users = users;
        this.permisos = permisos;
    }

    @GetMapping
    public List<ReservaDto> listar(@RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        permisos.exigirAlguno(username, VER);
        return service.listar();
    }

    @GetMapping("/{id}")
    public ReservaDto obtener(@PathVariable Long id, @RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        permisos.exigirAlguno(username, VER);
        return service.obtener(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReservaDto crear(@RequestBody ReservaDto body, @RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        permisos.exigir(username, "Reservas", "create");
        return service.crear(body, usuarioId(username));
    }

    @PutMapping("/{id}")
    public ReservaDto actualizar(@PathVariable Long id, @RequestBody ReservaDto body, @RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        permisos.exigirAlguno(username, EDITAR);
        return service.actualizar(id, body);
    }

    @PostMapping("/{id}/pagos")
    public ReservaDto registrarPago(@PathVariable Long id, @RequestBody PagoDto body,
                                    @RequestAttribute(JwtAuthFilter.USERNAME) String username) {
        permisos.exigirAlguno(username, PAGAR);
        return service.registrarPago(id, body, usuarioId(username));
    }

    private Long usuarioId(String username) {
        return users.findUsuario(username).map(u -> u.getId()).orElse(null);
    }
}
