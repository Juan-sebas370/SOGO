package com.sogo.controller;

import com.sogo.model.User;
import com.sogo.service.UserService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;
    private final com.sogo.security.JwtUtil jwtUtil;
    private final ObjectProvider<ClientRegistrationRepository> clientRegistrations;
    private final com.sogo.service.CorreoService correo;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public AuthController(UserService userService, com.sogo.security.JwtUtil jwtUtil,
                           ObjectProvider<ClientRegistrationRepository> clientRegistrations, com.sogo.service.CorreoService correo) {
        this.userService = userService;
        this.jwtUtil = jwtUtil;
        this.clientRegistrations = clientRegistrations;
        this.correo = correo;
    }

    // Lets the frontend know which social providers actually have credentials configured,
    // so it can disable those buttons instead of redirecting into a 404
    // (see OAuth2ClientConfig: unconfigured providers have no /oauth2/authorization/* route at all).
    @GetMapping("/oauth-providers")
    public ResponseEntity<?> oauthProviders() {
        ClientRegistrationRepository repo = clientRegistrations.getIfAvailable();
        boolean google = repo != null && repo.findByRegistrationId("google") != null;
        boolean azure = repo != null && repo.findByRegistrationId("azure") != null;
        return ResponseEntity.ok(Map.of("google", google, "azure", azure));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> payload, jakarta.servlet.http.HttpServletRequest request) {
        String username = payload.get("username");
        String password = payload.get("password");
        if (username == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "username and password required"));
        }
        var ingreso = userService.authenticate(username, password, request.getRemoteAddr());
        // motivo: credenciales | bloqueada | desactivada | con activación vencida | sin acceso a SOGO
        if (!ingreso.ok()) return ResponseEntity.status(401).body(Map.of("error", ingreso.motivo()));
        User user = ingreso.user();
        String jwt = jwtUtil.generateToken(user.getUsername(), user.getRole());
        Map<String, Object> resp = new HashMap<>();
        resp.put("token", jwt);
        resp.put("username", user.getUsername());
        resp.put("role", user.getRole());
        resp.put("fullName", user.getFullName());
        resp.put("email", user.getEmail());
        return ResponseEntity.ok(resp);
    }

    // El JWT no se guarda en el servidor: cerrar sesión es borrarlo en el navegador
    @PostMapping("/logout")
    public ResponseEntity<?> logout() {
        return ResponseEntity.noContent().build();
    }

    /**
     * Envía por correo el enlace para restablecer la contraseña. La respuesta es la misma exista
     * o no la cuenta (así nadie puede averiguar qué correos están registrados). El enlace nunca
     * va en la respuesta: cualquiera podría restablecer cuentas ajenas.
     */
    @PostMapping("/reset-request")
    public ResponseEntity<?> resetRequest(@RequestBody Map<String, String> payload) {
        String email = payload.get("email") == null ? "" : payload.get("email").trim();
        if (email.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "email required", "message", "Escribe tu correo."));
        if (!correo.configurado()) {
            return ResponseEntity.status(503).body(Map.of("error", "mail-not-configured",
                    "message", "El envío de correos no está configurado en SOGO. Pide al administrador que restablezca tu contraseña."));
        }
        var uOpt = userService.findByEmail(email);
        if (uOpt.isPresent()) {
            var u = uOpt.get();
            String reset = userService.createResetTokenFor(u);
            String nombre = u.getNombre() == null ? "" : u.getNombre();
            if (!correo.enviarRecuperacion(u.getEmail(), nombre, frontendUrl + "/reset?token=" + reset)) {
                return ResponseEntity.status(502).body(Map.of("error", "mail-failed",
                        "message", "No se pudo enviar el correo en este momento. Intenta de nuevo en unos minutos."));
            }
        }
        return ResponseEntity.ok(Map.of("message", "Si el correo pertenece a una cuenta de SOGO, te enviamos un enlace para restablecer la contraseña. Revisa tu bandeja de entrada y la carpeta de spam."));
    }

    @PostMapping("/reset")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> payload) {
        String token = payload.get("token");
        String newPass = payload.get("password");
        if (token == null || newPass == null) return ResponseEntity.badRequest().body(Map.of("error", "token and password required"));
        boolean ok = userService.resetPassword(token, newPass);
        if (!ok) return ResponseEntity.status(400).body(Map.of("error", "invalid or expired token"));
        return ResponseEntity.ok(Map.of("message", "password reset successful"));
    }
}
