package com.sogo.dto;

/** Consumo con la forma de `Charge` del frontend (billing/charge.service.ts). */
public record ConsumoDto(
        String id,
        String reservationId,
        String category,
        String description,
        String detail,
        String date,
        double quantity,
        long unitValue,
        Long itemId,             // artículo de la dotación (pérdidas y daños)
        Integer floor,
        String reason,           // Faltante | Dañado
        boolean invoiced
) {}
