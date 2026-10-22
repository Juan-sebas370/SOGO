package com.sogo.controller;

import com.sogo.security.JwtAuthFilter;
import com.sogo.service.PermisoService;
import com.sogo.service.RespaldoService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Respaldos de la base de datos (Configuración › Auditoría y respaldos). Contienen todos los datos,
 * incluidos los personales: consultar, crear y descargar exige editar en Configuración.
 */
@RestController
@RequestMapping("/api/respaldos")
public class RespaldoController {

    private final RespaldoService respaldos;
    private final PermisoService permisos;

    public RespaldoController(RespaldoService respaldos, PermisoService permisos) {
        this.respaldos = respaldos;
        this.permisos = permisos;
    }

    @GetMapping
    public Map<String, Object> listar(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Configuración", "edit");
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("folder", respaldos.carpeta());
        m.put("backups", respaldos.listar());
        m.put("last", respaldos.estado());
        return m;
    }

    @PostMapping
    public Map<String, Object> respaldar(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Configuración", "edit");
        return respaldos.respaldar(false, permisos.nombre(user));
    }

    @GetMapping("/{nombre}")
    public ResponseEntity<FileSystemResource> descargar(@PathVariable String nombre, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Configuración", "edit");
        Path p = respaldos.archivo(nombre);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(nombre).build().toString())
                .body(new FileSystemResource(p));
    }
}
