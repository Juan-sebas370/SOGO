package com.sogo.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/** Historial de cuentas: cambios de estado, restablecimientos de contraseña y exportaciones. */
@Entity
@Table(name = "usuario_eventos")
public class UsuarioEvento {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String tipo;                // estado | clave | exportacion
    private LocalDateTime fecha;
    private String datos;

    public UsuarioEvento() {}
    public UsuarioEvento(String tipo, String datos) {
        this.tipo = tipo;
        this.datos = datos;
        this.fecha = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public String getTipo() { return tipo; }
    public LocalDateTime getFecha() { return fecha; }
    public String getDatos() { return datos; }
}
