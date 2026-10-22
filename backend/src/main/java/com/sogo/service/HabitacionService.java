package com.sogo.service;

import com.sogo.dto.HabitacionDto;
import com.sogo.entity.Habitacion;
import com.sogo.repository.HabitacionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class HabitacionService {

    // Estado manual de SOGO ↔ columna `estado` (la web solo ofrece las DISPONIBLE)
    private static final Map<String, String> ESTADO_DB = Map.of(
            "En limpieza", "LIMPIEZA",
            "En mantenimiento", "MANTENIMIENTO",
            "Fuera de servicio", "FUERA_DE_SERVICIO");

    private final HabitacionRepository habitaciones;

    public HabitacionService(HabitacionRepository habitaciones) {
        this.habitaciones = habitaciones;
    }

    @Transactional(readOnly = true)
    public List<HabitacionDto> listar() {
        return habitaciones.findAll().stream()
                .filter(h -> h.getNumero() != null && !Boolean.FALSE.equals(h.getActiva()))
                .sorted(Comparator.comparing(Habitacion::getNumero))
                .map(this::toDto)
                .toList();
    }

    /** Número de habitación → id de la tabla (para traducir las reservas). */
    @Transactional(readOnly = true)
    public Map<String, Long> idsPorNumero() {
        return habitaciones.findAll().stream().filter(h -> h.getNumero() != null)
                .collect(Collectors.toMap(Habitacion::getNumero, Habitacion::getId, (a, b) -> a));
    }

    @Transactional(readOnly = true)
    public Map<String, Integer> pisosPorNumero() {
        return habitaciones.findAll().stream().filter(h -> h.getNumero() != null && h.getPiso() != null)
                .collect(Collectors.toMap(Habitacion::getNumero, Habitacion::getPiso, (a, b) -> a));
    }

    @Transactional(readOnly = true)
    public Map<Long, String> numerosPorId() {
        return habitaciones.findAll().stream().filter(h -> h.getNumero() != null)
                .collect(Collectors.toMap(Habitacion::getId, Habitacion::getNumero));
    }

    @Transactional
    public HabitacionDto cambiarEstado(String numero, String estadoManual) {
        Habitacion h = habitaciones.findByNumero(numero)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "No existe la habitación " + numero));
        if (estadoManual != null && !ESTADO_DB.containsKey(estadoManual)) {
            throw new ResponseStatusException(BAD_REQUEST, "Estado no válido: " + estadoManual);
        }
        h.setEstado(estadoManual == null ? "DISPONIBLE" : ESTADO_DB.get(estadoManual));
        return toDto(h);
    }

    /** Crea o actualiza una habitación desde Configuración › Alojamiento (por número). */
    @Transactional
    public HabitacionDto guardar(String numero, HabitacionDto d) {
        Habitacion h = habitaciones.findByNumero(numero).orElseGet(() -> {
            Habitacion nueva = new Habitacion();
            nueva.setNumero(numero);
            nueva.setEstado("DISPONIBLE");
            nueva.setActiva(true);
            return nueva;
        });
        h.setPiso(d.floor());
        h.setTipo(d.type());
        h.setCapacidad(d.capacity());
        h.setCamas(d.beds() == null ? null : String.join(", ", d.beds()));
        h.setTipoBano(d.bathroom());
        h.setBano("Privado".equals(d.bathroom()));
        h.setComparteBanoCon(d.sharesBathWith());
        h.setPrecioNoche((double) d.pricePerNight());
        if (d.pricePerNightMid() != null) h.setPrecioMedia(d.pricePerNightMid().doubleValue());
        if (d.pricePerNightHigh() != null) h.setPrecioAlta(d.pricePerNightHigh().doubleValue());
        if (d.description() != null) h.setDescripcion(d.description());
        return toDto(habitaciones.save(h));
    }

    private HabitacionDto toDto(Habitacion h) {
        String bano = h.getTipoBano() != null ? h.getTipoBano()
                : Boolean.FALSE.equals(h.getBano()) ? "Compartido" : "Privado";
        List<String> camas = h.getCamas() == null || h.getCamas().isBlank() ? List.of()
                : Arrays.stream(h.getCamas().split("[,+·]")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        String manual = ESTADO_DB.entrySet().stream()
                .filter(e -> e.getValue().equalsIgnoreCase(String.valueOf(h.getEstado())))
                .map(Map.Entry::getKey).findFirst().orElse(null);
        return new HabitacionDto(
                "r" + h.getNumero(), h.getId(), h.getNumero(),
                h.getPiso() == null ? 1 : h.getPiso(),
                h.getTipo() == null ? "" : h.getTipo(),
                h.getCapacidad() == null ? 0 : h.getCapacidad(),
                camas, bano, h.getComparteBanoCon(),
                h.getPrecioNoche() == null ? 0 : Math.round(h.getPrecioNoche()),
                h.getDescripcion() == null ? "" : h.getDescripcion(),
                new ArrayList<>(h.getServicios()), new ArrayList<>(h.getImagenes()),
                manual,
                h.getPrecioMedia() == null ? null : Math.round(h.getPrecioMedia()),
                h.getPrecioAlta() == null ? null : Math.round(h.getPrecioAlta()));
    }
}
