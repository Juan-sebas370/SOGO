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

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public AuthController(UserService userService, com.sogo.security.JwtUtil jwtUtil,
                           ObjectProvider<ClientRegistrationRepository> clientRegistrations) {
        this.userService = userService;
        this.jwtUtil = jwtUtil;
        this.clientRegistrations = clientRegistrations;
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
    public ResponseEntity<?> login(@RequestBody Map<String, String> payload) {
        String username = payload.get("username");
        String password = payload.get("password");
        if (username == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "username and password required"));
        }
        boolean ok = userService.checkCredentials(username, password);
        if (!ok) return ResponseEntity.status(401).body(Map.of("error", "invalid credentials"));
        User user = userService.findByUsername(username).orElseThrow();
        // Generate JWT
        String jwt = jwtUtil.generateToken(username, user.getRole());
        Map<String, Object> resp = new HashMap<>();
        resp.put("token", jwt);
        resp.put("username", username);
        resp.put("role", user.getRole());
        resp.put("fullName", user.getFullName());
        resp.put("email", user.getEmail());
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestHeader(name = "Authorization", required = false) String auth) {
        if (auth != null && auth.startsWith("Bearer ")) {
            String token = auth.substring(7);
            userService.invalidateToken(token);
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/reset-request")
    public ResponseEntity<?> resetRequest(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        if (email == null) return ResponseEntity.badRequest().body(Map.of("error", "email required"));
        var uOpt = userService.findByEmail(email);
        if (uOpt.isEmpty()) return ResponseEntity.ok(Map.of("message", "If the email exists, a reset link was sent."));
        User u = uOpt.get();
        String reset = userService.createResetTokenFor(u);
        // In development we log the reset link. In production, send email.
        String link = frontendUrl + "/reset?token=" + reset;
        System.out.println("[RESET LINK] " + link + " for " + u.getEmail());
        return ResponseEntity.ok(Map.of("message", "reset link created (dev).", "link", link));
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
