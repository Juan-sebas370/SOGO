package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.ContabilidadService;
import com.sogo.service.PermisoService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Contabilidad. Consultar: permiso "ver" del módulo Contabilidad. Registrar comprobantes: "crear";
 * contabilizar borradores, integración manual, ajustes y plan de cuentas: "editar"; anular:
 * "eliminar"; dejar constancia de una exportación: "exportar".
 */
@RestController
@RequestMapping("/api/contabilidad")
public class ContabilidadController {

    private static final String MODULO = "Contabilidad";

    private final ContabilidadService contabilidad;
    private final PermisoService permisos;

    public ContabilidadController(ContabilidadService contabilidad, PermisoService permisos) {
        this.contabilidad = contabilidad;
        this.permisos = permisos;
    }

    @GetMapping("/ajustes")
    public ObjectNode ajustes(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return contabilidad.ajustes();
    }

    @PutMapping("/ajustes")
    public ObjectNode guardarAjustes(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return contabilidad.guardarAjustes(body, permisos.usuarioId(user));
    }

    @GetMapping("/cuentas")
    public List<ObjectNode> cuentas(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return contabilidad.cuentas();
    }

    @PutMapping("/cuentas")
    public ObjectNode guardarCuenta(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return contabilidad.guardarCuenta(body);
    }

    @DeleteMapping("/cuentas/{codigo}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void eliminarCuenta(@PathVariable String codigo, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "delete");
        contabilidad.eliminarCuenta(codigo);
    }


    @GetMapping("/centros")
    public List<ObjectNode> centros(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return contabilidad.centros();
    }

    @PutMapping("/centros")
    public List<ObjectNode> guardarCentro(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return contabilidad.guardarCentro(body);
    }
    @GetMapping("/asientos")
    public List<ObjectNode> asientos(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return contabilidad.asientos();
    }

    @PostMapping("/asientos")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode registrar(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "create");
        return contabilidad.registrar(body, permisos.usuarioId(user), permisos.nombre(user));
    }

    @PostMapping("/asientos/{id}/contabilizar")
    public ObjectNode contabilizar(@PathVariable long id, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return contabilidad.contabilizar(id);
    }

    // ── Documentos soporte (archivos guardados en la base de datos) ──

    @PostMapping("/asientos/{id}/soportes")
    public ObjectNode agregarSoporte(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "create");
        return contabilidad.agregarSoporte(id, body, permisos.nombre(user));
    }

    @GetMapping("/asientos/{id}/soportes/{soporte}")
    public ResponseEntity<byte[]> verSoporte(@PathVariable long id, @PathVariable long soporte, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        ContabilidadService.Archivo a = contabilidad.leerSoporte(id, soporte);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(a.tipo()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(a.nombre(), StandardCharsets.UTF_8).build().toString())
                .body(a.datos());
    }

    @DeleteMapping("/asientos/{id}/soportes/{soporte}")
    public ObjectNode quitarSoporte(@PathVariable long id, @PathVariable long soporte, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return contabilidad.quitarSoporte(id, soporte);
    }

    @PostMapping("/asientos/{id}/anular")
    public ObjectNode anular(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "delete");
        return contabilidad.anular(id, body.path("reason").asText(""), permisos.usuarioId(user), permisos.nombre(user));
    }

    /** La sincronización automática la hace cualquier sesión que consulte Contabilidad; la manual, quien puede editar. */
    @PostMapping("/integracion")
    public ObjectNode integrar(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "Manual".equals(body.path("mode").asText()) ? "edit" : "view");
        return contabilidad.integrar(body, permisos.usuarioId(user), permisos.nombre(user));
    }

    @GetMapping("/eventos")
    public List<ObjectNode> eventos(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return contabilidad.eventos();
    }

    @PostMapping("/eventos/exportacion")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void exportacion(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "export");
        contabilidad.exportacion(body, permisos.usuarioId(user), permisos.nombre(user));
    }
}
