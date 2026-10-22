package com.sogo.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * Tabla `tarifas_reserva`, compartida con la página web: tarifa POR PERSONA de
 * cada tipo de reserva (individual, familiar, pasadia, grupal) en temporada
 * baja, media y alta. La web cobra con estos valores. Ver database/19_tarifas.sql.
 */
@Entity
@Table(name = "tarifas_reserva")
public class TarifaReserva {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tipo_reserva")
    private String tipoReserva;

    private String nombre;

    @Column(name = "precio_baja")
    private Double precioBaja;

    @Column(name = "precio_media")
    private Double precioMedia;

    @Column(name = "precio_alta")
    private Double precioAlta;

    @Column(name = "fecha_modificacion")
    private LocalDateTime fechaModificacion;

    public Long getId() { return id; }
    public String getTipoReserva() { return tipoReserva; }
    public void setTipoReserva(String tipoReserva) { this.tipoReserva = tipoReserva; }
    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }
    public Double getPrecioBaja() { return precioBaja; }
    public void setPrecioBaja(Double precioBaja) { this.precioBaja = precioBaja; }
    public Double getPrecioMedia() { return precioMedia; }
    public void setPrecioMedia(Double precioMedia) { this.precioMedia = precioMedia; }
    public Double getPrecioAlta() { return precioAlta; }
    public void setPrecioAlta(Double precioAlta) { this.precioAlta = precioAlta; }
    public LocalDateTime getFechaModificacion() { return fechaModificacion; }
    public void setFechaModificacion(LocalDateTime fechaModificacion) { this.fechaModificacion = fechaModificacion; }
}
