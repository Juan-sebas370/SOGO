package com.sogo.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** Cargo a la cuenta de una estadía (tabla `consumos`), p. ej. una toalla que el huésped no entregó. */
@Entity
@Table(name = "consumos")
@SuppressWarnings("unused") // columnas de la BD compartida que este código no lee
public class Consumo {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long reservaId;
    private String categoria;
    private String descripcion;
    private String detalle;
    private LocalDate fecha;
    private BigDecimal cantidad;
    private BigDecimal valorUnitario;
    private String tipoImpuesto;
    private BigDecimal tarifaImpuesto;
    private String origen;
    private Long facturaId;
    private LocalDateTime creadoAt;
    private Long creadoPor;
    private Long dotacionId;
    private Integer piso;
    private String motivo;          // Faltante | Dañado

    public Long getId() { return id; }
    public Long getReservaId() { return reservaId; }
    public void setReservaId(Long v) { this.reservaId = v; }
    public String getCategoria() { return categoria; }
    public void setCategoria(String v) { this.categoria = v; }
    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String v) { this.descripcion = v; }
    public String getDetalle() { return detalle; }
    public void setDetalle(String v) { this.detalle = v; }
    public LocalDate getFecha() { return fecha; }
    public void setFecha(LocalDate v) { this.fecha = v; }
    public BigDecimal getCantidad() { return cantidad; }
    public void setCantidad(BigDecimal v) { this.cantidad = v; }
    public BigDecimal getValorUnitario() { return valorUnitario; }
    public void setValorUnitario(BigDecimal v) { this.valorUnitario = v; }
    public void setTipoImpuesto(String v) { this.tipoImpuesto = v; }
    public void setTarifaImpuesto(BigDecimal v) { this.tarifaImpuesto = v; }
    public void setOrigen(String v) { this.origen = v; }
    public Long getFacturaId() { return facturaId; }
    public void setCreadoAt(LocalDateTime v) { this.creadoAt = v; }
    public void setCreadoPor(Long v) { this.creadoPor = v; }
    public Long getDotacionId() { return dotacionId; }
    public void setDotacionId(Long v) { this.dotacionId = v; }
    public Integer getPiso() { return piso; }
    public void setPiso(Integer v) { this.piso = v; }
    public String getMotivo() { return motivo; }
    public void setMotivo(String v) { this.motivo = v; }
}
