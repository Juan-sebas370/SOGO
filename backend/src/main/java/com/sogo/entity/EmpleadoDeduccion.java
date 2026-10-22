package com.sogo.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;

/** Descuento autorizado por el empleado (préstamo, libranza, embargo…). */
@Entity
@Table(name = "empleado_deducciones")
@SuppressWarnings("unused") // columnas de la BD compartida que este código no lee
public class EmpleadoDeduccion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "empleado_id")
    private Empleado empleado;
    private String clave;               // id del frontend (d…)
    private String tipo;
    private String descripcion;
    private BigDecimal monto;
    private Integer cuotas;             // NULL = hasta nueva orden
    private String desdePeriodo;        // YYYY-MM
    private Boolean activa;

    public Long getId() { return id; }
    public void setEmpleado(Empleado v) { this.empleado = v; }
    public String getClave() { return clave; }
    public void setClave(String v) { this.clave = v; }
    public String getTipo() { return tipo; }
    public void setTipo(String v) { this.tipo = v; }
    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String v) { this.descripcion = v; }
    public BigDecimal getMonto() { return monto; }
    public void setMonto(BigDecimal v) { this.monto = v; }
    public Integer getCuotas() { return cuotas; }
    public void setCuotas(Integer v) { this.cuotas = v; }
    public String getDesdePeriodo() { return desdePeriodo; }
    public void setDesdePeriodo(String v) { this.desdePeriodo = v; }
    public void setActiva(Boolean v) { this.activa = v; }

    public String claveOId() {
        return clave != null && !clave.isBlank() ? clave : "d" + id;
    }
}
