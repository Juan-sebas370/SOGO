package com.sogo.security;

import com.sogo.model.User;
import com.sogo.service.UserService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final UserService userService;
    private final JwtUtil jwtUtil;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public OAuth2SuccessHandler(UserService userService, JwtUtil jwtUtil) {
        this.userService = userService;
        this.jwtUtil = jwtUtil;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {
        OAuth2AuthenticationToken token = (OAuth2AuthenticationToken) authentication;
        OAuth2User principal = token.getPrincipal();

        String email = extractEmail(principal);
        if (email == null || email.isBlank()) {
            response.sendRedirect(UriComponentsBuilder.fromUriString(frontendUrl + "/")
                    .queryParam("oauthError", "no-email")
                    .build().toUriString());
            return;
        }

        // La sesión de Google solo sirvió para comprobar el correo: SOGO usa su propio JWT
        var sesion = request.getSession(false);
        if (sesion != null) sesion.invalidate();

        var ingreso = userService.authenticateOAuth(email, "Google", request.getRemoteAddr());
        if (!ingreso.ok()) {
            String motivo = "no-registrado".equals(ingreso.motivo()) ? "not-registered" : ingreso.motivo();
            response.sendRedirect(UriComponentsBuilder.fromUriString(frontendUrl + "/")
                    .queryParam("oauthError", encode(motivo))
                    .build().toUriString());
            return;
        }
        User user = ingreso.user();
        String jwt = jwtUtil.generateToken(user.getUsername(), user.getRole());

        String redirect = UriComponentsBuilder.fromUriString(frontendUrl + "/oauth-callback")
                .queryParam("token", jwt)
                .queryParam("username", encode(user.getUsername()))
                .queryParam("role", encode(user.getRole()))
                .queryParam("fullName", encode(user.getFullName() == null ? "" : user.getFullName()))
                .queryParam("email", encode(user.getEmail() == null ? "" : user.getEmail()))
                .build().toUriString();
        response.sendRedirect(redirect);
    }

    private String extractEmail(OAuth2User principal) {
        // Google (OIDC): the id_token carries a verified "email" claim.
        return principal instanceof OidcUser oidcUser ? oidcUser.getEmail() : null;
    }

    private String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
