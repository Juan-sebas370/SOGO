package com.sogo.dto;

import java.util.List;

/**
 * Habitación con la forma de `Room` del frontend (room.model.ts), más el id de la
 * tabla y el estado manual (En limpieza / En mantenimiento / Fuera de servicio).
 */
public record HabitacionDto(
        String id,
        Long dbId,
        String number,
        int floor,
        String type,
        int capacity,
        List<String> beds,
        String bathroom,
        String sharesBathWith,
        long pricePerNight,
        String description,
        List<String> services,
        List<String> photos,
        String manualStatus,
        /** Tarifa por noche en temporada media y alta (pricePerNight es la baja). Opcionales. */
        Long pricePerNightMid,
        Long pricePerNightHigh
) {}
