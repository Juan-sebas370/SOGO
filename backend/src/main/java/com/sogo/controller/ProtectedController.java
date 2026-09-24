package com.sogo.controller;

import com.sogo.security.JwtUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ProtectedController {

    private final JwtUtil jwtUtil;

    public ProtectedController(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @GetMapping("/dashboard-summary")
    public ResponseEntity<?> dashboard(@RequestHeader(name = "Authorization", required = false) String auth) {
        if (auth == null || !auth.startsWith("Bearer ")) return ResponseEntity.status(401).body(java.util.Map.of("error","missing token"));
        String token = auth.substring(7);
        String username = jwtUtil.validateAndGetUsername(token);
        if (username == null) return ResponseEntity.status(401).body(java.util.Map.of("error","invalid token"));
        // Return demo data
        return ResponseEntity.ok(java.util.Map.of(
                "username", username,
                "occupied", 12,
                "total", 28,
                "arrivals", 5,
                "departures", 3
        ));
    }
}
