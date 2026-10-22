package com.sogo.model;

/** Datos de la sesión que se entregan al frontend (vista de una fila de `usuarios`). */
public class User {
    private final Long id;
    private final String username;
    private final String email;
    private final String fullName;
    private final String role;

    public User(Long id, String username, String email, String fullName, String role) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.fullName = fullName;
        this.role = role;
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public String getFullName() { return fullName; }
    public String getRole() { return role; }
}
