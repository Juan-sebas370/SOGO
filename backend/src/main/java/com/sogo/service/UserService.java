package com.sogo.service;

import com.sogo.model.User;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class UserService {
    private final Map<String, User> users = new ConcurrentHashMap<>();
    private final Map<String, String> tokens = new ConcurrentHashMap<>();
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @PostConstruct
    public void init() {
        // Usuario por defecto: admin / Admin123
        User admin = new User("admin", "administrador@sogo.com", encoder.encode("Admin123"));
        admin.setRole("Administrador");
        admin.setFullName("Sebastián");
        users.put(admin.getUsername(), admin);

        User recepcionista = new User("recepcionista01", "recepcionista01@filandia.local", encoder.encode("Recepcion123*"));
        recepcionista.setRole("Recepcionista");
        recepcionista.setFullName("Camila Restrepo");
        users.put(recepcionista.getUsername(), recepcionista);

        User gerente = new User("gerente01", "gerente01@filandia.local", encoder.encode("Gerente123*"));
        gerente.setRole("Gerente");
        gerente.setFullName("Andrés Toro");
        users.put(gerente.getUsername(), gerente);
    }

    public Optional<User> findByUsername(String username) {
        return Optional.ofNullable(users.get(username));
    }

    public Optional<User> findByEmail(String email) {
        return users.values().stream().filter(u -> email.equalsIgnoreCase(u.getEmail())).findFirst();
    }

    public boolean checkCredentials(String username, String rawPassword) {
        User u = users.get(username);
        if (u == null || u.getPasswordHash() == null) return false;
        return encoder.matches(rawPassword, u.getPasswordHash());
    }

    // Used by the OAuth2 success handler: finds the user by email, or provisions
    // one with no local password (login is only possible via the social provider).
    public synchronized User findOrCreateOAuthUser(String email, String provider) {
        Optional<User> existing = findByEmail(email);
        if (existing.isPresent()) return existing.get();
        User u = new User(email, email, null);
        u.setRole("Recepcionista");
        u.setAuthProvider(provider);
        users.put(u.getUsername(), u);
        return u;
    }

    public String createTokenFor(String username) {
        String token = UUID.randomUUID().toString();
        tokens.put(token, username);
        return token;
    }

    public Optional<String> getUsernameForToken(String token) {
        return Optional.ofNullable(tokens.get(token));
    }

    public void invalidateToken(String token) {
        tokens.remove(token);
    }

    public String createResetTokenFor(User user) {
        String reset = UUID.randomUUID().toString();
        user.setResetToken(reset);
        user.setResetExpires(Instant.now().plus(1, ChronoUnit.HOURS));
        return reset;
    }

    public boolean resetPassword(String token, String newPassword) {
        Optional<User> u = users.values().stream().filter(x -> token.equals(x.getResetToken())).findFirst();
        if (u.isEmpty()) return false;
        User user = u.get();
        if (user.getResetExpires() == null || user.getResetExpires().isBefore(Instant.now())) return false;
        user.setPasswordHash(encoder.encode(newPassword));
        user.setResetToken(null);
        user.setResetExpires(null);
        return true;
    }

    // For demo/testing: create user
    public User createUser(String username, String email, String rawPassword) {
        User u = new User(username, email, encoder.encode(rawPassword));
        users.put(username, u);
        return u;
    }
}
