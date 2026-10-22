package com.sogo.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Exige un JWT válido en todo /api/** salvo /api/auth/** (login, recuperación).
 * El usuario de la sesión queda en el atributo {@link #USERNAME} de la petición.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    public static final String USERNAME = "sogo.username";
    public static final String ROLE = "sogo.role";

    private final JwtUtil jwtUtil;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public JwtAuthFilter(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String path = request.getRequestURI();
        return !path.startsWith("/api/") || path.startsWith("/api/auth/") || "OPTIONS".equals(request.getMethod());
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull FilterChain chain)
            throws ServletException, IOException {
        String auth = request.getHeader("Authorization");
        String token = auth != null && auth.startsWith("Bearer ") ? auth.substring(7) : null;
        String username = token != null ? jwtUtil.validateAndGetUsername(token) : null;
        if (token == null || username == null) {
            // Este filtro corre antes que la configuración CORS de Spring MVC: sin esta cabecera
            // el navegador mostraría un error de CORS en vez del 401.
            if (frontendUrl.equals(request.getHeader("Origin"))) {
                response.setHeader("Access-Control-Allow-Origin", frontendUrl);
                response.setHeader("Access-Control-Allow-Credentials", "true");
            }
            response.setStatus(401);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"error\":\"Sesión vencida o inválida\"}");
            return;
        }
        request.setAttribute(USERNAME, username);
        request.setAttribute(ROLE, jwtUtil.validateAndGetRole(token));
        chain.doFilter(request, response);
    }
}
