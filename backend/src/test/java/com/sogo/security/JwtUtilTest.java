package com.sogo.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

/** Pruebas unitarias del token de sesión (JWT): generación, validación y rechazo. */
@DisplayName("Seguridad · token JWT")
class JwtUtilTest {

    private static final String SECRET = "clave-de-pruebas-de-sogo-de-al-menos-32-bytes!!";

    private JwtUtil jwt(String secret, long minutes) {
        JwtUtil j = new JwtUtil();
        ReflectionTestUtils.setField(j, "secret", secret);
        ReflectionTestUtils.setField(j, "expirationMinutes", minutes);
        j.init();
        return j;
    }

    private JwtUtil jwt;

    @BeforeEach
    void setUp() { jwt = jwt(SECRET, 60); }

    @Test
    @DisplayName("un token recién generado devuelve su usuario y su rol")
    void generaYValida() {
        String token = jwt.generateToken("admin", "Administrador");
        assertEquals("admin", jwt.validateAndGetUsername(token));
        assertEquals("Administrador", jwt.validateAndGetRole(token));
    }

    @Test
    @DisplayName("un token alterado se rechaza")
    void rechazaAlterado() {
        String token = jwt.generateToken("admin", "Administrador");
        String alterado = token.substring(0, token.length() - 3) + (token.endsWith("aaa") ? "bbb" : "aaa");
        assertNull(jwt.validateAndGetUsername(alterado));
        assertNull(jwt.validateAndGetRole(alterado));
    }

    @Test
    @DisplayName("un token firmado con otra clave se rechaza")
    void rechazaOtraClave() {
        String ajeno = jwt("otra-clave-distinta-tambien-de-mas-de-32-bytes!!", 60).generateToken("admin", "Administrador");
        assertNull(jwt.validateAndGetUsername(ajeno));
    }

    @Test
    @DisplayName("un token vencido se rechaza")
    void rechazaVencido() {
        String vencido = jwt(SECRET, -1).generateToken("admin", "Administrador");
        assertNull(jwt.validateAndGetUsername(vencido));
    }

    @Test
    @DisplayName("texto que no es un token no hace caer el servidor")
    void toleraBasura() {
        assertNull(jwt.validateAndGetUsername("esto-no-es-un-jwt"));
        assertNull(jwt.validateAndGetUsername(""));
    }
}
