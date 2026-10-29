package com.sogo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Reglas de Facturación sin base de datos: JdbcTemplate y la configuración se simulan con Mockito,
 * así se prueba qué acepta y qué rechaza el servidor.
 */
@DisplayName("Facturación · servicio")
class FacturacionServiceTest {

    private static final String CUFE = "a3f9".repeat(24);
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;
    private ConfiguracionService config;
    private FacturacionService svc;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        config = mock(ConfiguracionService.class);
        when(config.leer(anyString())).thenReturn(Optional.empty());
        svc = new FacturacionService(jdbc, config, json, mock(PlatformTransactionManager.class), mock(CorreoService.class));
    }

    /** Estado DIAN que "tiene" la factura en la base simulada. */
    private void estado(String e) {
        when(jdbc.queryForList(startsWith("SELECT estado_dian"), eq(String.class), ArgumentMatchers.<Object>any())).thenReturn(List.of(e));
    }

    private HttpStatus status(ResponseStatusException ex) { return HttpStatus.valueOf(ex.getStatusCode().value()); }

    @Nested
    @DisplayName("CUFE")
    class Cufe {
        @Test
        @DisplayName("quita espacios y pasa a minúsculas")
        void limpia() {
            assertEquals(CUFE, FacturacionService.normalizarCufe("  " + CUFE.substring(0, 50).toUpperCase() + "\n" + CUFE.substring(50) + " "));
        }

        @Test
        @DisplayName("toma el CUFE del enlace del código QR de la DIAN")
        void desdeEnlace() {
            assertEquals(CUFE, FacturacionService.normalizarCufe("https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=" + CUFE + "&x=1"));
        }

        @Test
        @DisplayName("no recorta en silencio 98 caracteres seguidos (no se sabe cuáles 96 son)")
        void noRecorta() {
            assertEquals(98, FacturacionService.normalizarCufe(CUFE + "ab").length());
        }

        @Test
        @DisplayName("vacío o nulo queda vacío")
        void vacio() {
            assertEquals("", FacturacionService.normalizarCufe(null));
            assertEquals("", FacturacionService.normalizarCufe("   "));
        }
    }

    @Nested
    @DisplayName("Configuración de la resolución")
    class Configuracion {
        private ObjectNode config(String prefix, long from, long to) {
            ObjectNode c = json.createObjectNode();
            c.putObject("provider").put("apiKey", "");
            c.putObject("resolution").put("prefix", prefix).put("creditPrefix", "NC").put("from", from).put("to", to)
                    .put("validFrom", "2026-01-01").put("validTo", "2027-12-31");
            c.putArray("taxes").addObject().put("rate", 0.19);
            return c;
        }

        @Test
        @DisplayName("rechaza un prefijo en minúscula o demasiado largo")
        void prefijo() {
            ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> svc.guardarConfig(config("seb", 1, 5000), 1L));
            assertEquals(HttpStatus.BAD_REQUEST, status(ex));
            assertTrue(ex.getReason().contains("prefijo de facturas"));
            assertThrows(ResponseStatusException.class, () -> svc.guardarConfig(config("SEBAS", 1, 5000), 1L));
        }

        @Test
        @DisplayName("el rango debe ir de menor a mayor")
        void rango() {
            ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> svc.guardarConfig(config("SEB", 5000, 10), 1L));
            assertTrue(ex.getReason().contains("rango autorizado"));
        }

        @Test
        @DisplayName("una tarifa de impuesto fuera de 0–50 % se rechaza")
        void tarifa() {
            ObjectNode c = config("SEB", 1, 5000);
            ((com.fasterxml.jackson.databind.node.ArrayNode) c.get("taxes")).addObject().put("rate", 0.9);
            assertThrows(ResponseStatusException.class, () -> svc.guardarConfig(c, 1L));
        }

        @Test
        @DisplayName("no deja cerrar el rango antes de la última factura emitida")
        void rangoConEmitidas() {
            when(jdbc.queryForObject(startsWith("SELECT MAX"), eq(Long.class), ArgumentMatchers.<Object>any())).thenReturn(120L);
            ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> svc.guardarConfig(config("SEB", 1, 100), 1L));
            assertTrue(ex.getReason().contains("SEB-120"));
        }

        @Test
        @DisplayName("una configuración correcta se guarda y la clave de API nunca vuelve al navegador")
        void guarda() {
            ObjectNode c = config("SEB", 1, 5000);
            ((ObjectNode) c.get("provider")).put("apiKey", "secreta");
            when(config.leer("facturacion")).thenReturn(Optional.empty(), Optional.of(c));
            ObjectNode out = svc.guardarConfig(c, 1L);
            verify(config).guardar(eq("facturacion"), any(), eq(1L));
            assertEquals("", out.path("provider").path("apiKey").asText());
            assertTrue(out.path("provider").path("apiKeySet").asBoolean());
        }

        @Test
        @DisplayName("probar conexión sin URL ni credenciales lo dice, no inventa un resultado")
        void probarSinDatos() {
            ObjectNode r = svc.probarConexion(1L);
            assertFalse(r.path("ok").asBoolean());
            assertTrue(r.path("message").asText().contains("Faltan"));
        }
    }

    @Nested
    @DisplayName("Respuesta de la DIAN")
    class RespuestaDian {
        @Test
        @DisplayName("solo se registra en una factura pendiente de validación")
        void soloEnValidacion() {
            estado("Aceptada");
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> svc.respuestaDian(7, json.createObjectNode().put("accepted", true).put("cufe", CUFE), "Admin"));
            assertEquals(HttpStatus.CONFLICT, status(ex));
        }

        @Test
        @DisplayName("rechaza un CUFE que no tiene 96 caracteres hexadecimales")
        void cufeInvalido() {
            estado("En validación");
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> svc.respuestaDian(7, json.createObjectNode().put("accepted", true).put("cufe", "Aceptada y lista"), "Admin"));
            assertEquals(HttpStatus.BAD_REQUEST, status(ex));
            assertTrue(ex.getReason().contains("96 caracteres"));
        }

        @Test
        @DisplayName("no acepta un CUFE ya registrado en otra factura")
        void cufeDuplicado() {
            estado("En validación");
            when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM facturas WHERE cufe"), eq(Integer.class), eq(CUFE), ArgumentMatchers.<Object>any())).thenReturn(1);
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> svc.respuestaDian(7, json.createObjectNode().put("accepted", true).put("cufe", CUFE), "Admin"));
            assertEquals(HttpStatus.CONFLICT, status(ex));
        }

        @Test
        @DisplayName("un rechazo necesita el motivo")
        void rechazoSinMotivo() {
            estado("En validación");
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> svc.respuestaDian(7, json.createObjectNode().put("accepted", false).put("reason", "no"), "Admin"));
            assertEquals(HttpStatus.BAD_REQUEST, status(ex));
        }
    }

    @Nested
    @DisplayName("Borradores y anulación")
    class Anulacion {
        @Test
        @DisplayName("un borrador se elimina, no se anula")
        void borradorNoSeAnula() {
            estado("Borrador");
            assertEquals(HttpStatus.CONFLICT, status(assertThrows(ResponseStatusException.class, () -> svc.anular(7, "Error en los valores", "Admin"))));
        }

        @Test
        @DisplayName("una factura emitida no se elimina: se anula con nota crédito")
        void emitidaNoSeElimina() {
            estado("Aceptada");
            assertEquals(HttpStatus.CONFLICT, status(assertThrows(ResponseStatusException.class, () -> svc.eliminarBorrador(7))));
        }

        @Test
        @DisplayName("anular exige un motivo")
        void anularSinMotivo() {
            estado("Aceptada");
            when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM facturas WHERE id"), eq(Integer.class), ArgumentMatchers.<Object>any())).thenReturn(0);
            assertEquals(HttpStatus.BAD_REQUEST, status(assertThrows(ResponseStatusException.class, () -> svc.anular(7, "x", "Admin"))));
        }

        @Test
        @DisplayName("no se anula dos veces")
        void yaAnulada() {
            estado("Aceptada");
            when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM facturas WHERE id"), eq(Integer.class), ArgumentMatchers.<Object>any())).thenReturn(1);
            assertEquals(HttpStatus.CONFLICT, status(assertThrows(ResponseStatusException.class, () -> svc.anular(7, "Error en los valores", "Admin"))));
        }
    }
}
