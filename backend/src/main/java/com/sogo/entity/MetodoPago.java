package com.sogo.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "metodos_pago")
@SuppressWarnings("unused") // columnas de la BD compartida que este código no lee
public class MetodoPago {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String nombre;
    private String tipo;
    private Boolean activo;
    private LocalDateTime fechaCreacion;

    public MetodoPago() {}

    public MetodoPago(String nombre) {
        this.nombre = nombre;
        this.tipo = "OTRO";
        this.activo = true;
        this.fechaCreacion = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public String getNombre() { return nombre; }
}
