package com.sogo.entity;

import jakarta.persistence.*;

import java.util.ArrayList;
import java.util.List;

/** Tabla `habitaciones`, compartida con la página web. */
@Entity
@Table(name = "habitaciones")
public class Habitacion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String numero;
    private String tipo;
    private Integer piso;
    private Integer capacidad;
    /** Tarifa por noche en temporada BAJA (nombre histórico de la columna). */
    private Double precioNoche;
    /** Tarifas por noche en temporada media y alta (database/19_tarifas.sql). */
    private Double precioMedia;
    private Double precioAlta;
    private String descripcion;
    /** Estado manual: DISPONIBLE | LIMPIEZA | MANTENIMIENTO | FUERA_DE_SERVICIO (la web solo ofrece las DISPONIBLE). */
    private String estado;
    private Boolean bano;
    private String camas;
    private String tipoBano;
    private String comparteBanoCon;
    private Boolean activa;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "habitacion_servicios", joinColumns = @JoinColumn(name = "habitacion_id"))
    @Column(name = "servicios")
    private List<String> servicios = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "habitacion_imagenes", joinColumns = @JoinColumn(name = "habitacion_id"))
    @Column(name = "imagenes")
    private List<String> imagenes = new ArrayList<>();

    public Long getId() { return id; }
    public String getNumero() { return numero; }
    public void setNumero(String numero) { this.numero = numero; }
    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }
    public Integer getPiso() { return piso; }
    public void setPiso(Integer piso) { this.piso = piso; }
    public Integer getCapacidad() { return capacidad; }
    public void setCapacidad(Integer capacidad) { this.capacidad = capacidad; }
    public Double getPrecioNoche() { return precioNoche; }
    public void setPrecioNoche(Double precioNoche) { this.precioNoche = precioNoche; }
    public Double getPrecioMedia() { return precioMedia; }
    public void setPrecioMedia(Double precioMedia) { this.precioMedia = precioMedia; }
    public Double getPrecioAlta() { return precioAlta; }
    public void setPrecioAlta(Double precioAlta) { this.precioAlta = precioAlta; }
    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String descripcion) { this.descripcion = descripcion; }
    public String getEstado() { return estado; }
    public void setEstado(String estado) { this.estado = estado; }
    public Boolean getBano() { return bano; }
    public void setBano(Boolean bano) { this.bano = bano; }
    public String getCamas() { return camas; }
    public void setCamas(String camas) { this.camas = camas; }
    public String getTipoBano() { return tipoBano; }
    public void setTipoBano(String tipoBano) { this.tipoBano = tipoBano; }
    public String getComparteBanoCon() { return comparteBanoCon; }
    public void setComparteBanoCon(String comparteBanoCon) { this.comparteBanoCon = comparteBanoCon; }
    public Boolean getActiva() { return activa; }
    public void setActiva(Boolean activa) { this.activa = activa; }
    public List<String> getServicios() { return servicios; }
    public List<String> getImagenes() { return imagenes; }
}
