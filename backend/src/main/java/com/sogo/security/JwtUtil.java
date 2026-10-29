package com.sogo.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.Key;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Date;

@Component
public class JwtUtil {

    private static final Logger log = LoggerFactory.getLogger(JwtUtil.class);

    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.expiration-minutes}")
    private long expirationMinutes;

    private Key key;

    /** Clave que estuvo publicada en el repositorio: nunca se acepta como clave de firma. */
    private static final String OLD_PUBLIC_SECRET = "change-me-dev-secret-change-me-dev-secret-123456";
    private static final Path LOCAL_FILE = Path.of("jwt.local.properties");

    @PostConstruct
    public void init() {
        if (secret == null || secret.isBlank() || secret.equals(OLD_PUBLIC_SECRET)) secret = createLocalSecret();
        key = Keys.hmacShaKeyFor(secret.getBytes());
    }

    /**
     * Sin JWT_SECRET: se genera una clave aleatoria de 64 bytes y se guarda en jwt.local.properties
     * (ignorado por git) para que las sesiones sigan valiendo tras reiniciar el servidor.
     */
    private static String createLocalSecret() {
        byte[] bytes = new byte[64];
        new SecureRandom().nextBytes(bytes);
        String generated = Base64.getEncoder().encodeToString(bytes);
        try {
            Files.writeString(LOCAL_FILE, "# Clave de firma de sesiones de SOGO (generada automáticamente). No la compartas ni la subas a git.\n"
                    + "app.jwt.secret=" + generated + "\n");
            log.info("Se generó una clave de sesiones nueva en {}", LOCAL_FILE.toAbsolutePath());
        } catch (IOException e) {
            log.warn("No se pudo guardar {}: las sesiones se cerrarán al reiniciar el servidor ({})", LOCAL_FILE, e.getMessage());
        }
        return generated;
    }

    public String generateToken(String username, String role) {
        long now = System.currentTimeMillis();
        Date iat = new Date(now);
        Date exp = new Date(now + expirationMinutes * 60_000);
        return Jwts.builder()
                .setSubject(username)
                .claim("role", role)
                .setIssuedAt(iat)
                .setExpiration(exp)
                .signWith(key)
                .compact();
    }

    public String validateAndGetUsername(String token) {
        try {
            Jws<Claims> claims = Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(token);
            return claims.getBody().getSubject();
        } catch (JwtException | IllegalArgumentException ex) {   // vacío o mal formado = inválido (401), no un error 500
            return null;
        }
    }

    public String validateAndGetRole(String token) {
        try {
            Jws<Claims> claims = Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(token);
            return claims.getBody().get("role", String.class);
        } catch (JwtException | IllegalArgumentException ex) {   // vacío o mal formado = inválido (401), no un error 500
            return null;
        }
    }
}
