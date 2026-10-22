package com.sogo.controller;

import com.sogo.dto.HabitacionDto;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.HabitacionService;
import com.sogo.service.PermisoService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.FORBIDDEN;

/**
 * Habitaciones. Consultar: cualquier sesión. Cambiar el estado (limpieza, mantenimiento): permiso
 * "editar" de Alojamiento. Cambiar datos o precios de una habitación: "editar" de Alojamiento o
 * de Configuración.
 */
@RestController
@RequestMapping("/api/habitaciones")
public class HabitacionController {

    private final HabitacionService service;
    private final PermisoService permisos;

    public HabitacionController(HabitacionService service, PermisoService permisos) {
        this.service = service;
        this.permisos = permisos;
    }

    @GetMapping
    public List<HabitacionDto> listar() {
        return service.listar();
    }

    /** body: {"status": "En limpieza" | "En mantenimiento" | "Fuera de servicio" | null} */
    @PutMapping("/{numero}/estado")
    public HabitacionDto cambiarEstado(@PathVariable String numero, @RequestBody Map<String, String> body,
                                       @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Alojamiento", "edit");
        return service.cambiarEstado(numero, body.get("status"));
    }

    @PutMapping("/{numero}")
    public HabitacionDto guardar(@PathVariable String numero, @RequestBody HabitacionDto body,
                                 @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        if (!permisos.puede(user, "Alojamiento", "edit") && !permisos.puede(user, "Configuración", "edit")) {
            throw new ResponseStatusException(FORBIDDEN, "Tu rol no tiene permiso para cambiar las habitaciones ni sus precios");
        }
        return service.guardar(numero, body);
    }
}
