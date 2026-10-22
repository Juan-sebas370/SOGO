package com.sogo.service;

import com.sogo.dto.ConsumoDto;
import com.sogo.entity.Consumo;
import com.sogo.entity.Dotacion;
import com.sogo.repository.ConsumoRepository;
import com.sogo.repository.ReservaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

import static org.springframework.http.HttpStatus.*;

/**
 * Consumos cargados a una estadía. El valor que suman a la reserva (servicios
 * adicionales) lo lleva el frontend en la misma fila de escrituras de la reserva.
 */
@Service
public class ConsumoService {

    private final ConsumoRepository consumos;
    private final ReservaRepository reservas;
    private final DotacionService dotacion;

    public ConsumoService(ConsumoRepository consumos, ReservaRepository reservas, DotacionService dotacion) {
        this.consumos = consumos;
        this.reservas = reservas;
        this.dotacion = dotacion;
    }

    @Transactional(readOnly = true)
    public List<ConsumoDto> listar() {
        return consumos.findAll().stream().sorted(Comparator.comparing(Consumo::getId)).map(this::toDto).toList();
    }

    @Transactional
    public ConsumoDto crear(ConsumoDto d, Long usuarioId) {
        Long reservaId = Long.valueOf(d.reservationId());
        if (!reservas.existsById(reservaId)) throw new ResponseStatusException(NOT_FOUND, "No existe la reserva " + reservaId);
        if (d.quantity() <= 0 || d.unitValue() < 0) throw new ResponseStatusException(BAD_REQUEST, "Cantidad o valor no válidos");
        if (d.description() == null || d.description().isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Falta la descripción");

        Consumo c = new Consumo();
        c.setReservaId(reservaId);
        c.setCategoria(d.category());
        c.setDescripcion(d.description().trim());
        c.setDetalle(d.detail());
        c.setFecha(d.date() == null || d.date().isBlank() ? LocalDate.now() : LocalDate.parse(d.date()));
        c.setCantidad(BigDecimal.valueOf(d.quantity()));
        c.setValorUnitario(BigDecimal.valueOf(d.unitValue()));
        // Reponer lo perdido o dañado es una indemnización, no una venta: sin IVA (validar con el contador)
        c.setTipoImpuesto("IVA");
        c.setTarifaImpuesto(BigDecimal.ZERO);
        c.setOrigen(d.itemId() != null ? "Dotación" : "Manual");
        c.setCreadoAt(LocalDateTime.now());
        c.setCreadoPor(usuarioId);
        if (d.itemId() != null) {
            Dotacion item = dotacion.buscar(d.itemId());
            if (Boolean.FALSE.equals(item.getCobrable())) {
                throw new ResponseStatusException(BAD_REQUEST, item.getNombre() + " no se cobra al huésped");
            }
            c.setDotacionId(item.getId());
            c.setPiso(d.floor());
            c.setMotivo(d.reason());
        }
        return toDto(consumos.save(c));
    }

    @Transactional
    public void eliminar(Long id) {
        Consumo c = consumos.findById(id).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "No existe el consumo " + id));
        if (c.getFacturaId() != null) throw new ResponseStatusException(CONFLICT, "El consumo ya está facturado");
        consumos.delete(c);
    }

    private ConsumoDto toDto(Consumo c) {
        return new ConsumoDto(
                String.valueOf(c.getId()), String.valueOf(c.getReservaId()),
                c.getCategoria(), c.getDescripcion(), c.getDetalle() == null ? "" : c.getDetalle(),
                c.getFecha() == null ? null : c.getFecha().toString(),
                c.getCantidad() == null ? 0 : c.getCantidad().doubleValue(),
                c.getValorUnitario() == null ? 0 : c.getValorUnitario().longValue(),
                c.getDotacionId(), c.getPiso(), c.getMotivo(), c.getFacturaId() != null);
    }
}
