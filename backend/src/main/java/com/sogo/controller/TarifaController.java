package com.sogo.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.dto.TarifaReservaDto;
import com.sogo.entity.TarifaReserva;
import com.sogo.repository.TarifaReservaRepository;
import com.sogo.security.JwtAuthFilter;
import com.sogo.service.ConfiguracionService;
import com.sogo.service.PermisoService;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

import static org.springframework.http.HttpStatus.FORBIDDEN;

/**
 * Tarifas por tipo de reserva y calendario de temporadas (Alojamiento › Tarifas y temporadas).
 * Lo que se guarda aquí es lo que cobra la página web del hospedaje: la web lee la misma tabla
 * `tarifas_reserva` y la misma clave `temporadas` de `configuracion`.
 * Consultar: quien vea Alojamiento o Reservas. Cambiar: permiso "editar" de Alojamiento.
 */
@RestController
@RequestMapping("/api/tarifas")
public class TarifaController {

    private static final Set<String> TIPOS = Set.of("individual", "familiar", "pasadia", "grupal");
    private static final Set<String> TEMPORADAS = Set.of("baja", "media", "alta");
    private static final String MES_DIA = "(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])";

    private final TarifaReservaRepository tarifas;
    private final PermisoService permisos;
    private final ConfiguracionService config;

    public TarifaController(TarifaReservaRepository tarifas, PermisoService permisos, ConfiguracionService config) {
        this.tarifas = tarifas;
        this.permisos = permisos;
        this.config = config;
    }

    private void exigirConsulta(String user) {
        if (!permisos.puede(user, "Alojamiento", "view") && !permisos.puede(user, "Reservas", "view")) {
            throw new ResponseStatusException(FORBIDDEN, "Tu rol no tiene permiso para consultar las tarifas");
        }
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<TarifaReservaDto> listar(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        exigirConsulta(user);
        return tarifas.findAll().stream().map(this::toDto).toList();
    }

    /** Guarda las tarifas enviadas (una por tipo). Rechaza valores vacíos o negativos. */
    @PutMapping
    @Transactional
    public List<TarifaReservaDto> guardar(@RequestBody List<TarifaReservaDto> cambios, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Alojamiento", "edit");
        for (TarifaReservaDto d : cambios) {
            if (!TIPOS.contains(d.type())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tipo de reserva desconocido: " + d.type());
            }
            if (d.low() <= 0 || d.mid() <= 0 || d.high() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Las tarifas deben ser mayores que cero (" + d.type() + ")");
            }
            TarifaReserva t = tarifas.findByTipoReserva(d.type()).orElseGet(() -> {
                TarifaReserva nueva = new TarifaReserva();
                nueva.setTipoReserva(d.type());
                return nueva;
            });
            t.setNombre(d.name() == null || d.name().isBlank() ? d.type() : d.name().trim());
            t.setPrecioBaja((double) d.low());
            t.setPrecioMedia((double) d.mid());
            t.setPrecioAlta((double) d.high());
            t.setFechaModificacion(LocalDateTime.now());
            tarifas.save(t);
        }
        return tarifas.findAll().stream().map(this::toDto).toList();
    }

    // ── Calendario de temporadas ─────────────────────────

    /** Reglas de temporadas (configuracion 'temporadas'); null si aún no se han guardado (se usan las de fábrica). */
    @GetMapping("/temporadas")
    public JsonNode temporadas(@RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        exigirConsulta(user);
        return config.leer("temporadas").orElse(null);
    }

    /**
     * { alta: [{nombre, desde: MM-DD, hasta: MM-DD}], media: [...], semanaSanta, finesDeSemana,
     *   festivosMedia, festivos: [YYYY-MM-DD], especiales: [{nombre, desde: YYYY-MM-DD, hasta, temporada}] }
     */
    @PutMapping("/temporadas")
    public JsonNode guardarTemporadas(@RequestBody JsonNode b, @RequestAttribute(JwtAuthFilter.USERNAME) String user) {
        permisos.exigir(user, "Alojamiento", "edit");
        if (!(b instanceof ObjectNode o)) throw malo("Calendario de temporadas no válido");
        for (String k : List.of("alta", "media")) {
            if (!o.path(k).isArray()) o.putArray(k);
            for (JsonNode r : o.path(k)) {
                if (!r.path("desde").asText().matches(MES_DIA) || !r.path("hasta").asText().matches(MES_DIA)) {
                    throw malo("Las fechas de los periodos van como MM-DD (por ejemplo 12-15)");
                }
            }
        }
        if (!o.path("festivos").isArray()) o.putArray("festivos");
        for (JsonNode f : o.path("festivos")) fecha(f.asText(), "Festivo no válido: " + f.asText());
        if (!o.path("especiales").isArray()) o.putArray("especiales");
        for (JsonNode e : o.path("especiales")) {
            LocalDate desde = fecha(e.path("desde").asText(), "Fecha especial no válida");
            LocalDate hasta = fecha(e.path("hasta").asText(), "Fecha especial no válida");
            if (hasta.isBefore(desde)) throw malo("En las fechas especiales, «hasta» va después de «desde»");
            if (!TEMPORADAS.contains(e.path("temporada").asText())) throw malo("Temporada no válida en las fechas especiales");
        }
        for (String k : List.of("semanaSanta", "finesDeSemana", "festivosMedia")) o.put(k, o.path(k).asBoolean(true));
        // Festivos ordenados y sin repetir
        java.util.TreeSet<String> orden = new java.util.TreeSet<>();
        o.path("festivos").forEach(f -> orden.add(f.asText()));
        ArrayNode limpio = o.putArray("festivos");
        orden.forEach(limpio::add);
        return config.guardar("temporadas", o, permisos.usuarioId(user));
    }

    private static LocalDate fecha(String s, String error) {
        try { return LocalDate.parse(s); } catch (Exception e) { throw malo(error); }
    }

    private static ResponseStatusException malo(String m) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, m); }

    private TarifaReservaDto toDto(TarifaReserva t) {
        return new TarifaReservaDto(t.getTipoReserva(), t.getNombre(),
                Math.round(t.getPrecioBaja()), Math.round(t.getPrecioMedia()), Math.round(t.getPrecioAlta()));
    }
}
