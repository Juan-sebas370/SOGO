package com.sogo.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

/** Pruebas del filtro que exige sesión en /api/** (salvo /api/auth/**). */
@DisplayName("Seguridad · filtro de autenticación")
class JwtAuthFilterTest {

    private static final String FRONT = "http://localhost:4201";
    private JwtUtil jwt;
    private JwtAuthFilter filter;

    @BeforeEach
    void setUp() {
        jwt = new JwtUtil();
        ReflectionTestUtils.setField(jwt, "secret", "clave-de-pruebas-de-sogo-de-al-menos-32-bytes!!");
        ReflectionTestUtils.setField(jwt, "expirationMinutes", 60L);
        jwt.init();
        filter = new JwtAuthFilter(jwt);
        ReflectionTestUtils.setField(filter, "frontendUrl", FRONT);
    }

    private MockHttpServletResponse run(MockHttpServletRequest req, MockFilterChain chain) throws Exception {
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, chain);
        return res;
    }

    @Test
    @DisplayName("sin token responde 401 y no deja pasar la petición")
    void sinToken401() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse res = run(new MockHttpServletRequest("GET", "/api/reservas"), chain);
        assertEquals(401, res.getStatus());
        assertNull(chain.getRequest(), "la petición no debe llegar al controlador");
        assertTrue(res.getContentAsString().contains("Sesión vencida o inválida"));
    }

    @Test
    @DisplayName("el 401 incluye la cabecera CORS para que el navegador muestre el error real")
    void cors401() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/reservas");
        req.addHeader("Origin", FRONT);
        assertEquals(FRONT, run(req, new MockFilterChain()).getHeader("Access-Control-Allow-Origin"));
    }

    @Test
    @DisplayName("con un token inválido responde 401")
    void tokenInvalido401() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/facturacion/facturas");
        req.addHeader("Authorization", "Bearer token-falso");
        assertEquals(401, run(req, new MockFilterChain()).getStatus());
    }

    @Test
    @DisplayName("con «Bearer» vacío responde 401, no un error 500 (error encontrado por las pruebas)")
    void bearerVacio401() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/reservas");
        req.addHeader("Authorization", "Bearer ");
        assertEquals(401, run(req, new MockFilterChain()).getStatus());
    }

    @Test
    @DisplayName("con un token válido deja pasar y anota usuario y rol")
    void tokenValidoPasa() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/reservas");
        req.addHeader("Authorization", "Bearer " + jwt.generateToken("recepcion", "Recepcionista"));
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse res = run(req, chain);
        assertEquals(200, res.getStatus());
        assertNotNull(chain.getRequest());
        assertEquals("recepcion", req.getAttribute(JwtAuthFilter.USERNAME));
        assertEquals("Recepcionista", req.getAttribute(JwtAuthFilter.ROLE));
    }

    @Test
    @DisplayName("el inicio de sesión y la recuperación de clave no piden token")
    void rutasPublicas() throws Exception {
        for (String path : new String[] { "/api/auth/login", "/api/auth/reset-request", "/api/auth/refresh" }) {
            MockFilterChain chain = new MockFilterChain();
            run(new MockHttpServletRequest("POST", path), chain);
            assertNotNull(chain.getRequest(), path + " debe ser pública");
        }
    }

    @Test
    @DisplayName("las peticiones previas de CORS (OPTIONS) pasan sin token")
    void optionsPasa() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        run(new MockHttpServletRequest("OPTIONS", "/api/reservas"), chain);
        assertNotNull(chain.getRequest());
    }
}
