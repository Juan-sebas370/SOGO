package com.sogo.controller;

import com.sogo.service.ConsumoService;
import com.sogo.service.PermisoService;
import com.sogo.service.ReservaService;
import com.sogo.service.UserService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** Las reservas y consumos tienen datos personales: el servidor exige permisos, no solo la pantalla. */
class ReservaControllerPermisosTest {

    private final ReservaService reservas = mock(ReservaService.class);
    private final ConsumoService consumos = mock(ConsumoService.class);
    private final UserService users = mock(UserService.class);
    private final PermisoService permisos = mock(PermisoService.class);
    private final ReservaController reservaController = new ReservaController(reservas, users, permisos);
    private final ConsumoController consumoController = new ConsumoController(consumos, users, permisos);

    /** Un rol que solo tiene los permisos dados. */
    private void rolCon(String... concedidos) {
        when(permisos.puede(anyString(), anyString(), anyString())).thenAnswer(i -> List.of(concedidos).contains(i.getArgument(1) + ":" + i.getArgument(2)));
        doCallRealMethod().when(permisos).exigirAlguno(anyString(), any(String[].class));
        doCallRealMethod().when(permisos).exigir(anyString(), anyString(), anyString());
    }

    private static void negado(org.junit.jupiter.api.function.Executable accion) {
        assertEquals(403, assertThrows(ResponseStatusException.class, accion).getStatusCode().value());
    }

    @Test
    @DisplayName("un rol sin relación con reservas (Nómina) no las puede leer ni cambiar")
    void nominaNoVeReservas() {
        rolCon("Nómina:view", "Nómina:edit");
        negado(() -> reservaController.listar("nomina"));
        negado(() -> reservaController.obtener(1L, "nomina"));
        negado(() -> reservaController.crear(null, "nomina"));
        negado(() -> reservaController.actualizar(1L, null, "nomina"));
        negado(() -> reservaController.registrarPago(1L, null, "nomina"));
        negado(() -> consumoController.listar("nomina"));
        negado(() -> consumoController.crear(null, "nomina"));
        negado(() -> consumoController.eliminar(1L, "nomina"));
        verifyNoInteractions(reservas, consumos);
    }

    @Test
    @DisplayName("los módulos que trabajan sobre reservas las pueden consultar")
    void modulosRelacionadosConsultan() {
        for (String permiso : List.of("Reservas:view", "Alojamiento:view", "TRA:view", "Facturación:view", "Restaurante:view", "Reportes:view", "Contabilidad:view")) {
            rolCon(permiso);
            assertDoesNotThrow(() -> reservaController.listar("u"), permiso);
        }
    }

    @Test
    @DisplayName("solo lectura: Consulta ve las reservas pero no las crea, edita ni cobra")
    void consultaSoloLee() {
        rolCon("Reservas:view", "Alojamiento:view");
        assertDoesNotThrow(() -> reservaController.listar("consulta"));
        negado(() -> reservaController.crear(null, "consulta"));
        negado(() -> reservaController.actualizar(1L, null, "consulta"));
        negado(() -> reservaController.registrarPago(1L, null, "consulta"));
    }

    @Test
    @DisplayName("el check-in (Alojamiento) y los cargos de Facturación pueden actualizar la reserva")
    void otrosModulosActualizan() {
        rolCon("Alojamiento:edit");
        assertDoesNotThrow(() -> reservaController.actualizar(1L, null, "aloja"));
        rolCon("Facturación:create");
        assertDoesNotThrow(() -> reservaController.actualizar(1L, null, "recep"));
        assertDoesNotThrow(() -> reservaController.registrarPago(1L, null, "recep"));
        assertDoesNotThrow(() -> consumoController.crear(null, "recep"));
    }
}
