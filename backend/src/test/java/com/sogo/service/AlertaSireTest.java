package com.sogo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sogo.dto.ReservaDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Aviso por correo del SIRE: qué entradas y salidas de extranjeros siguen sin reportar, sin base de datos. */
@DisplayName("Alertas · SIRE")
class AlertaSireTest {

    private JdbcTemplate jdbc;
    private AlertaCorreoService svc;

    /** TRA de la reserva 7: un extranjero (pasaporte) y un colombiano; `reportes` en JSON. */
    private static String datos(String reportes) {
        return """
            {"guests":[{"id":"g1","docType":"PA","firstNames":"Larry","lastNames":"Waytt"},
                       {"id":"g2","docType":"CC","firstNames":"Ana","lastNames":"Gómez"}],
             "sire":{"guests":{},"reports":%s}}""".formatted(reportes);
    }

    private static ReservaDto reserva(String checkedInAt, String checkedOutAt) {
        return new ReservaDto("7", "RSV-2026-00007", "Larry Waytt", "Pasaporte", "A0132", "", "", "", "Individual", "Directo", "Habitación",
                null, List.of("103"), 2, 0, 0, "2026-11-01", "2026-11-03", 2, "Solo alojamiento", 0, 0, List.of(), "Confirmada",
                checkedInAt, checkedOutAt, "", "", "", null, null, "Larry", "Waytt");
    }

    private void enBase(String json) throws Exception {
        doAnswer(inv -> {
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong(1)).thenReturn(7L);
            when(rs.getString("datos")).thenReturn(json);
            ((RowCallbackHandler) inv.getArgument(1)).processRow(rs);
            return null;
        }).when(jdbc).query(startsWith("SELECT reserva_id, CAST(datos"), any(RowCallbackHandler.class));
    }

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        svc = new AlertaCorreoService(jdbc, mock(ConfiguracionService.class), mock(CorreoService.class), mock(ReservaService.class), new ObjectMapper());
    }

    private List<AlertaCorreoService.Item> revisar(String ahora, ReservaDto r) {
        List<AlertaCorreoService.Item> out = new ArrayList<>();
        svc.sire(LocalDateTime.parse(ahora), List.of(r), out);
        return out;
    }

    @Test
    @DisplayName("la entrada de ayer sin reportar sale como vencida a las 7:00; el colombiano no aparece")
    void vencida() throws Exception {
        enBase(datos("[]"));
        List<AlertaCorreoService.Item> items = revisar("2026-11-02T07:05", reserva("2026-11-01T15:00", null));
        assertEquals(1, items.size());
        assertEquals("sire-2026-11-02", items.get(0).key());
        assertTrue(items.get(0).text().contains("Entrada 01/11/2026 · Larry Waytt"));
        assertFalse(items.get(0).text().contains("Ana"));
    }

    @Test
    @DisplayName("la salida de hoy se recuerda a las 18:00, no antes")
    void deHoy() throws Exception {
        enBase(datos("[{\"guestId\":\"g1\",\"type\":\"ENTRADA\"}]"));
        ReservaDto r = reserva("2026-11-01T15:00", "2026-11-02T10:00");
        assertTrue(revisar("2026-11-02T12:00", r).isEmpty());
        List<AlertaCorreoService.Item> items = revisar("2026-11-02T18:30", r);
        assertEquals(1, items.size());
        assertEquals("sire-hoy-2026-11-02", items.get(0).key());
        assertTrue(items.get(0).text().contains("Salida 02/11/2026"));
    }

    @Test
    @DisplayName("lo reportado no se avisa")
    void reportado() throws Exception {
        enBase(datos("[{\"guestId\":\"g1\",\"type\":\"ENTRADA\"},{\"guestId\":\"g1\",\"type\":\"SALIDA\"}]"));
        assertTrue(revisar("2026-11-03T19:00", reserva("2026-11-01T15:00", "2026-11-02T10:00")).isEmpty());
    }
}
