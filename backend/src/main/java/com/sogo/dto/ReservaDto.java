package com.sogo.dto;

import java.util.List;

/**
 * Reserva con la misma forma que `Reservation` del frontend (reservation.model.ts):
 * así Angular la usa tal cual. Fechas como texto: YYYY-MM-DD y YYYY-MM-DDTHH:mm.
 */
public record ReservaDto(
        String id,
        String code,
        String guestName,
        String docType,
        String docNumber,
        String phone,
        String email,
        String city,
        String reservationType,
        String channel,
        String lodgingType,
        Integer floor,
        List<String> rooms,
        int adults,
        int children,
        int infants,
        String checkIn,
        String checkOut,
        int nights,
        String plan,
        long lodgingAmount,
        long extrasAmount,
        List<PagoDto> payments,
        String status,
        String checkedInAt,
        String checkedOutAt,
        String observations,
        String createdAt,
        String updatedAt,
        String cancelReason,
        String dataConsentAt,
        // Nombres y apellidos por separado (columnas nombre_huesped y apellido_huesped, como la web).
        // guestName sigue siendo el nombre completo que usan los demás módulos.
        String firstName,
        String lastName
) {
    public record PagoDto(String date, String method, long amount, String receipt) {}
}
