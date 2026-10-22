package com.sogo.dto;

import java.util.List;

/** Artículo de la dotación con sus cantidades por piso. */
public record DotacionDto(
        Long id,
        String category,
        String name,
        long unitPrice,          // cobro al huésped por unidad perdida o dañada
        boolean chargeable,
        int order,
        List<Floor> floors,
        String updatedAt
) {
    /** Unidades en un piso; annualUse solo para amenities (consumo anual estimado). */
    public record Floor(int floor, double quantity, Double annualUse) {}
}
