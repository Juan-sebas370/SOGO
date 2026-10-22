package com.sogo.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Tabla `pagos`: la web registra los de Wompi (origen Web), SOGO los de recepción (origen SOGO). */
@Entity
@Table(name = "pagos")
@SuppressWarnings("unused") // columnas de la BD compartida que este código no lee
public class Pago {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long reservaId;
    private Long usuarioId;
    private Long metodoPagoId;
    private BigDecimal monto;
    private String estado;              // aprobado | pendiente | rechazado | anulado | error
    private String numeroTransaccion;
    private String referenciaBanco;
    private LocalDateTime fechaPago;
    private LocalDateTime fechaCreacion;
    private String origen;
    private String comprobante;

    public Long getReservaId() { return reservaId; }
    public void setReservaId(Long v) { this.reservaId = v; }
    public void setUsuarioId(Long v) { this.usuarioId = v; }
    public Long getMetodoPagoId() { return metodoPagoId; }
    public void setMetodoPagoId(Long v) { this.metodoPagoId = v; }
    public BigDecimal getMonto() { return monto; }
    public void setMonto(BigDecimal v) { this.monto = v; }
    public String getEstado() { return estado; }
    public void setEstado(String v) { this.estado = v; }
    public String getNumeroTransaccion() { return numeroTransaccion; }
    public LocalDateTime getFechaPago() { return fechaPago; }
    public void setFechaPago(LocalDateTime v) { this.fechaPago = v; }
    public LocalDateTime getFechaCreacion() { return fechaCreacion; }
    public void setFechaCreacion(LocalDateTime v) { this.fechaCreacion = v; }
    public void setOrigen(String v) { this.origen = v; }
    public String getComprobante() { return comprobante; }
    public void setComprobante(String v) { this.comprobante = v; }
}
