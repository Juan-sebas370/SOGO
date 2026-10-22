package com.sogo.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Corrida de nómina de un período. El objeto completo de la aplicación va en `datos` (JSON);
 * el estado, quién lo cambió y los totales quedan en columnas, y el detalle por empleado se
 * copia a `nomina_novedades`, `nomina_liquidaciones` y `comprobantes_pago` (NominaService).
 */
@Entity
@Table(name = "nominas")
@SuppressWarnings("unused") // columnas de la BD compartida que este código no lee
public class Nomina {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String clave;               // id del frontend
    private String periodo;             // YYYY-MM
    private LocalDate fechaPago;
    private String estado;              // Borrador | Confirmada | Pagada | Anulada
    private LocalDateTime creadoAt;
    private Long creadoPor;
    private LocalDateTime confirmadoAt;
    private Long confirmadoPor;
    private LocalDateTime pagadoAt;
    private Long pagadoPor;
    private LocalDateTime anuladoAt;
    private Long anuladoPor;
    private String motivoAnulacion;
    private Integer numEmpleados;
    private BigDecimal totalDevengado;
    private BigDecimal totalDeducciones;
    private BigDecimal totalNeto;
    private String datos;

    public Long getId() { return id; }
    public String getClave() { return clave; }
    public void setClave(String v) { this.clave = v; }
    public String getPeriodo() { return periodo; }
    public void setPeriodo(String v) { this.periodo = v; }
    public void setFechaPago(LocalDate v) { this.fechaPago = v; }
    public String getEstado() { return estado; }
    public void setEstado(String v) { this.estado = v; }
    public LocalDateTime getCreadoAt() { return creadoAt; }
    public void setCreadoAt(LocalDateTime v) { this.creadoAt = v; }
    public Long getCreadoPor() { return creadoPor; }
    public void setCreadoPor(Long v) { this.creadoPor = v; }
    public void setConfirmadoAt(LocalDateTime v) { this.confirmadoAt = v; }
    public void setConfirmadoPor(Long v) { this.confirmadoPor = v; }
    public void setPagadoAt(LocalDateTime v) { this.pagadoAt = v; }
    public void setPagadoPor(Long v) { this.pagadoPor = v; }
    public void setAnuladoAt(LocalDateTime v) { this.anuladoAt = v; }
    public void setAnuladoPor(Long v) { this.anuladoPor = v; }
    public void setMotivoAnulacion(String v) { this.motivoAnulacion = v; }
    public void setNumEmpleados(Integer v) { this.numEmpleados = v; }
    public void setTotalDevengado(BigDecimal v) { this.totalDevengado = v; }
    public void setTotalDeducciones(BigDecimal v) { this.totalDeducciones = v; }
    public void setTotalNeto(BigDecimal v) { this.totalNeto = v; }
    public String getDatos() { return datos; }
    public void setDatos(String v) { this.datos = v; }
}
