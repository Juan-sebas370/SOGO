package com.sogo.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Tabla `reservas`, compartida con la página web. `codigo` y `huesped_id` los
 * llena el trigger trg_reservas_before_insert, por eso no se insertan desde aquí.
 */
@Entity
@Table(name = "reservas")
@SuppressWarnings("unused") // columnas de la BD compartida que este código no lee
public class Reserva {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(insertable = false, updatable = false)
    private String codigo;

    // Huésped principal (copia en la reserva, igual que la web)
    private String nombreHuesped;
    private String apellidoHuesped;
    private String tipoDocumento;
    private String numeroDocumento;
    private String codigoPais;
    private String telefonoContacto;
    private String emailContacto;
    private String pais;
    private String ciudad;

    // Tipo y espacio: valores de la web
    private String tipoReserva;   // individual | familiar | pasadia | grupal
    private String modoEspacio;   // habitaciones | piso | casa
    private String espacio;       // piso1 | piso2 | completo
    private String canal;
    private String plan;

    private Long habitacionId;
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "reserva_habitaciones", joinColumns = @JoinColumn(name = "reserva_id"))
    @Column(name = "habitacion_id")
    private List<Long> habitacionesIds = new ArrayList<>();

    private Integer huespedes;    // adultos
    private Integer ninos3;       // bebés
    private Integer ninos10;      // niños
    private Integer ninos11;      // niños mayores

    private LocalDate fechaIngreso;
    private LocalDate fechaSalida;
    private Integer noches;
    private Double precioNoche;
    private Double precioTotal;
    private BigDecimal valorExtras;

    private String estado;        // PENDIENTE | CONFIRMADA | CANCELADA | COMPLETADA | NO_PRESENTADA
    private LocalDateTime checkinAt;
    private LocalDateTime checkoutAt;
    private String observaciones;
    private String motivoCancelacion;
    private LocalDateTime consentimientoDatosAt;
    private Long creadoPor;
    private LocalDateTime fechaCreacion;
    private LocalDateTime fechaModificacion;

    public Long getId() { return id; }
    public String getCodigo() { return codigo; }
    public String getNombreHuesped() { return nombreHuesped; }
    public void setNombreHuesped(String v) { this.nombreHuesped = v; }
    public String getApellidoHuesped() { return apellidoHuesped; }
    public void setApellidoHuesped(String v) { this.apellidoHuesped = v; }
    public String getTipoDocumento() { return tipoDocumento; }
    public void setTipoDocumento(String v) { this.tipoDocumento = v; }
    public String getNumeroDocumento() { return numeroDocumento; }
    public void setNumeroDocumento(String v) { this.numeroDocumento = v; }
    public String getCodigoPais() { return codigoPais; }
    public void setCodigoPais(String v) { this.codigoPais = v; }
    public String getTelefonoContacto() { return telefonoContacto; }
    public void setTelefonoContacto(String v) { this.telefonoContacto = v; }
    public String getEmailContacto() { return emailContacto; }
    public void setEmailContacto(String v) { this.emailContacto = v; }
    public String getPais() { return pais; }
    public String getCiudad() { return ciudad; }
    public void setCiudad(String v) { this.ciudad = v; }
    public String getTipoReserva() { return tipoReserva; }
    public void setTipoReserva(String v) { this.tipoReserva = v; }
    public String getModoEspacio() { return modoEspacio; }
    public void setModoEspacio(String v) { this.modoEspacio = v; }
    public String getEspacio() { return espacio; }
    public void setEspacio(String v) { this.espacio = v; }
    public String getCanal() { return canal; }
    public void setCanal(String v) { this.canal = v; }
    public String getPlan() { return plan; }
    public void setPlan(String v) { this.plan = v; }
    public Long getHabitacionId() { return habitacionId; }
    public void setHabitacionId(Long v) { this.habitacionId = v; }
    public List<Long> getHabitacionesIds() { return habitacionesIds; }
    public Integer getHuespedes() { return huespedes; }
    public void setHuespedes(Integer v) { this.huespedes = v; }
    public Integer getNinos3() { return ninos3; }
    public void setNinos3(Integer v) { this.ninos3 = v; }
    public Integer getNinos10() { return ninos10; }
    public void setNinos10(Integer v) { this.ninos10 = v; }
    public Integer getNinos11() { return ninos11; }
    public void setNinos11(Integer v) { this.ninos11 = v; }
    public LocalDate getFechaIngreso() { return fechaIngreso; }
    public void setFechaIngreso(LocalDate v) { this.fechaIngreso = v; }
    public LocalDate getFechaSalida() { return fechaSalida; }
    public void setFechaSalida(LocalDate v) { this.fechaSalida = v; }
    public Integer getNoches() { return noches; }
    public void setNoches(Integer v) { this.noches = v; }
    public void setPrecioNoche(Double v) { this.precioNoche = v; }
    public Double getPrecioTotal() { return precioTotal; }
    public void setPrecioTotal(Double v) { this.precioTotal = v; }
    public BigDecimal getValorExtras() { return valorExtras; }
    public void setValorExtras(BigDecimal v) { this.valorExtras = v; }
    public String getEstado() { return estado; }
    public void setEstado(String v) { this.estado = v; }
    public LocalDateTime getCheckinAt() { return checkinAt; }
    public void setCheckinAt(LocalDateTime v) { this.checkinAt = v; }
    public LocalDateTime getCheckoutAt() { return checkoutAt; }
    public void setCheckoutAt(LocalDateTime v) { this.checkoutAt = v; }
    public String getObservaciones() { return observaciones; }
    public void setObservaciones(String v) { this.observaciones = v; }
    public String getMotivoCancelacion() { return motivoCancelacion; }
    public void setMotivoCancelacion(String v) { this.motivoCancelacion = v; }
    public LocalDateTime getConsentimientoDatosAt() { return consentimientoDatosAt; }
    public void setConsentimientoDatosAt(LocalDateTime v) { this.consentimientoDatosAt = v; }
    public void setCreadoPor(Long v) { this.creadoPor = v; }
    public LocalDateTime getFechaCreacion() { return fechaCreacion; }
    public void setFechaCreacion(LocalDateTime v) { this.fechaCreacion = v; }
    public LocalDateTime getFechaModificacion() { return fechaModificacion; }
    public void setFechaModificacion(LocalDateTime v) { this.fechaModificacion = v; }
}
