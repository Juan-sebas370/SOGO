package com.sogo.dto;

/**
 * Tarifa por persona de un tipo de reserva (individual | familiar | pasadia | grupal)
 * en cada temporada, con la forma que usa el frontend de SOGO.
 */
public record TarifaReservaDto(
        String type,
        String name,
        long low,
        long mid,
        long high
) {}
