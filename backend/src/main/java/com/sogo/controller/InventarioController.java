package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.InventarioService;
import com.sogo.service.PermisoService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Inventarios. Leer: cualquier sesión. Registrar productos y entradas: permiso "crear";
 * salidas, ajustes, cambios de productos y alertas: permiso "editar" del módulo Inventarios.
 */
@RestController
@RequestMapping("/api/inventario")
public class InventarioController {

    private final InventarioService inventario;
    private final PermisoService permisos;

    public InventarioController(InventarioService inventario, PermisoService permisos) {
        this.inventario = inventario;
        this.permisos = permisos;
    }

    private long uid(String user) { Long id = permisos.usuarioId(user); return id == null ? 0 : id; }

    @GetMapping("/categorias")
    public List<ObjectNode> categorias() { return inventario.categorias(); }

    @PostMapping("/categorias")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode crearCategoria(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Inventarios", "create");
        return inventario.crearCategoria(body.path("name").asText(""));
    }

    @PutMapping("/categorias/{id}")
    public void usarCategoria(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Inventarios", "edit");
        inventario.usarCategoria(id, body.path("inUse").asBoolean(true), permisos.nombre(user));
    }

    @GetMapping("/proveedores")
    public List<ObjectNode> proveedores() { return inventario.proveedores(); }

    @PostMapping("/proveedores")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode crearProveedor(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Inventarios", "create");
        return inventario.crearProveedor(body);
    }

    @GetMapping("/productos")
    public List<ObjectNode> productos() { return inventario.productos(); }

    @PostMapping("/productos")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode crearProducto(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Inventarios", "create");
        return inventario.crearProducto(body, uid(user), permisos.nombre(user));
    }

    @PutMapping("/productos/{id}")
    public ObjectNode actualizarProducto(@PathVariable long id, @RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Inventarios", "edit");
        return inventario.actualizarProducto(id, body, uid(user), permisos.nombre(user));
    }

    @PostMapping("/productos/{id}/solicitar-compra")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void solicitarCompra(@PathVariable long id, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Inventarios", "edit");
        inventario.solicitarCompra(id);
    }

    @GetMapping("/movimientos")
    public List<ObjectNode> movimientos() { return inventario.movimientos(); }

    @GetMapping("/movimientos/proximos")
    public Map<String, String> proximos() { return inventario.proximosNumeros(); }

    @PostMapping("/movimientos")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode registrar(@RequestBody JsonNode body, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        String tipo = body.path("kind").asText("");
        // Las entradas (compras, devoluciones) son como registrar; salidas y ajustes cambian lo que hay
        permisos.exigir(user, "Inventarios", "Entrada".equals(tipo) ? "create" : "edit");
        return inventario.registrar(body, uid(user), permisos.nombre(user));
    }

    @GetMapping("/alertas")
    public List<ObjectNode> alertas() { return inventario.alertas(); }

    @PostMapping("/alertas/{id}/atender")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void atender(@PathVariable long id, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Inventarios", "edit");
        inventario.atender(id, uid(user));
    }

    /** Tras cambiar los umbrales (Configuración › Metas), se recalculan las alertas. */
    @PostMapping("/alertas/recalcular")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void recalcular(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        inventario.sincronizarAlertas(null, uid(user));
    }
}
