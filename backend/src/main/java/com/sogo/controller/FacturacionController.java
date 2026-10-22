package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.FacturacionService;
import com.sogo.service.PermisoService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Facturación electrónica. Permisos del módulo Facturación (Usuarios y roles):
 * ver = consultar · crear = borradores y emitir · editar = validar datos, registrar la respuesta
 * de la DIAN y corregir · exportar = descargar, enviar y reportes · eliminar = anular con nota crédito.
 * La configuración (resolución, proveedor, tarifas) exige editar en Configuración.
 */
@RestController
@RequestMapping("/api/facturacion")
public class FacturacionController {

    private static final String MODULO = "Facturación";

    private final FacturacionService facturas;
    private final PermisoService permisos;

    public FacturacionController(FacturacionService facturas, PermisoService permisos) {
        this.facturas = facturas;
        this.permisos = permisos;
    }

    // ── Configuración ──

    @GetMapping("/config")
    public ObjectNode config() {
        return facturas.configPublica();
    }

    @PutMapping("/config")
    public ObjectNode guardarConfig(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Configuración", "edit");
        return facturas.guardarConfig(body, permisos.usuarioId(user));
    }

    @PostMapping("/config/probar")
    public ObjectNode probar(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Configuración", "edit");
        return facturas.probarConexion(permisos.usuarioId(user));
    }

    // ── Facturas ──

    @GetMapping("/facturas")
    public List<ObjectNode> listar(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "view");
        return facturas.listar();
    }

    @PostMapping("/facturas")
    public ObjectNode guardarBorrador(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "create");
        return facturas.guardarBorrador(body, permisos.usuarioId(user), permisos.nombre(user));
    }

    @DeleteMapping("/facturas/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void eliminarBorrador(@PathVariable long id, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "create");
        facturas.eliminarBorrador(id);
    }

    /** id 0 = factura nueva que se emite sin haberse guardado como borrador. */
    @PostMapping("/facturas/{id}/emitir")
    public ObjectNode emitir(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "create");
        return facturas.emitir(id, body, permisos.usuarioId(user), permisos.nombre(user));
    }

    @PostMapping("/facturas/{id}/respuesta-dian")
    public ObjectNode respuesta(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return facturas.respuestaDian(id, body, permisos.nombre(user));
    }

    @PostMapping("/facturas/{id}/corregir")
    public ObjectNode corregir(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return facturas.corregir(id, body, permisos.nombre(user));
    }

    @PostMapping("/facturas/{id}/envio")
    public ObjectNode envio(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "export");
        return facturas.registrarEnvio(id, body, permisos.nombre(user));
    }

    @PostMapping("/facturas/{id}/correo")
    public ObjectNode correo(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "export");
        return facturas.enviarCorreo(id, body, permisos.nombre(user));
    }

    @PostMapping("/facturas/{id}/descarga")
    public ObjectNode descarga(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "export");
        return facturas.registrarDescarga(id, body.path("what").asText("PDF"), permisos.nombre(user));
    }

    @PostMapping("/facturas/{id}/pago")
    public ObjectNode pago(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "edit");
        return facturas.registrarPago(id, body.path("detail").asText(""), permisos.nombre(user));
    }

    @PostMapping("/facturas/{id}/anular")
    public ObjectNode anular(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, MODULO, "delete");
        return facturas.anular(id, body.path("reason").asText(""), permisos.nombre(user));
    }
}
