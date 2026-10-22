package com.sogo.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Artículo de la dotación de la casa (camas, lencería, equipos, cocina, amenities).
 * `precioUnitario` es lo que se le cobra al huésped si pierde o daña una unidad.
 */
@Entity
@Table(name = "dotacion")
public class Dotacion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String categoria;
    private String nombre;
    private BigDecimal precioUnitario;
    private Boolean cobrable;
    private Integer orden;
    private Boolean activo;
    @Column(insertable = false, updatable = false)
    private LocalDateTime fechaModificacion;
    private Long modificadoPor;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "dotacion_cantidades", joinColumns = @JoinColumn(name = "dotacion_id"))
    @OrderBy("piso")
    private List<CantidadPiso> cantidades = new ArrayList<>();

    @Embeddable
    public static class CantidadPiso {
        private Integer piso;
        private BigDecimal cantidad;
        private BigDecimal consumoAnual;

        public CantidadPiso() {}
        public CantidadPiso(Integer piso, BigDecimal cantidad, BigDecimal consumoAnual) {
            this.piso = piso;
            this.cantidad = cantidad;
            this.consumoAnual = consumoAnual;
        }
        public Integer getPiso() { return piso; }
        public BigDecimal getCantidad() { return cantidad; }
        public BigDecimal getConsumoAnual() { return consumoAnual; }
    }

    public Long getId() { return id; }
    public String getCategoria() { return categoria; }
    public void setCategoria(String v) { this.categoria = v; }
    public String getNombre() { return nombre; }
    public void setNombre(String v) { this.nombre = v; }
    public BigDecimal getPrecioUnitario() { return precioUnitario; }
    public void setPrecioUnitario(BigDecimal v) { this.precioUnitario = v; }
    public Boolean getCobrable() { return cobrable; }
    public void setCobrable(Boolean v) { this.cobrable = v; }
    public Integer getOrden() { return orden; }
    public void setOrden(Integer v) { this.orden = v; }
    public Boolean getActivo() { return activo; }
    public void setActivo(Boolean v) { this.activo = v; }
    public LocalDateTime getFechaModificacion() { return fechaModificacion; }
    public Long getModificadoPor() { return modificadoPor; }
    public void setModificadoPor(Long v) { this.modificadoPor = v; }
    public List<CantidadPiso> getCantidades() { return cantidades; }
}
