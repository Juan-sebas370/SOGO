package com.sogo.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Tabla `empleados` (de la web, ampliada por SOGO). `clave` es el id del frontend (e…).
 * Salarios por vigencia en `empleado_salarios`, descuentos en `empleado_deducciones`
 * y el historial de cambios en `sogoDatos` (JSON).
 */
@Entity
@Table(name = "empleados")
@SuppressWarnings("unused") // columnas de la BD compartida que este código no lee
public class Empleado {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String clave;
    private String numeroEmpleado;      // EMP-001
    private String nombre;
    private String apellido;
    private LocalDate fechaNacimiento;
    private String tipoDocumento;
    private String numeroDocumento;
    private String email;
    private String telefono;
    private String direccion;
    private String cargo;
    private String departamento;        // área
    private LocalDate fechaContratacion;
    private LocalDate fechaTerminacion; // retiro
    private String estado;              // Activo | Vacaciones | Retirado
    private Boolean activo;
    private String tipoContrato;
    private LocalDate finContrato;
    private Integer horasSemanales;
    private BigDecimal salario;         // salario vigente (la web lo lee de aquí)
    private String eps;
    private String fondoPension;
    private String arl;
    private String riesgoArl;
    private String cajaCompensacion;
    private String banco;
    private String tipoCuenta;
    private String numeroCuenta;
    private Long usuarioId;
    private LocalDateTime fechaCreacion;
    private LocalDateTime fechaModificacion;
    private String sogoDatos;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "empleado_salarios", joinColumns = @JoinColumn(name = "empleado_id"))
    @OrderBy("desde")
    private List<Salario> salarios = new ArrayList<>();

    @OneToMany(mappedBy = "empleado", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    private List<EmpleadoDeduccion> deducciones = new ArrayList<>();

    @Embeddable
    public static class Salario {
        private LocalDate desde;
        private BigDecimal monto;
        public Salario() {}
        public Salario(LocalDate desde, BigDecimal monto) { this.desde = desde; this.monto = monto; }
        public LocalDate getDesde() { return desde; }
        public BigDecimal getMonto() { return monto; }
    }

    public Long getId() { return id; }
    public String getClave() { return clave; }
    public void setClave(String v) { this.clave = v; }
    public String getNumeroEmpleado() { return numeroEmpleado; }
    public void setNumeroEmpleado(String v) { this.numeroEmpleado = v; }
    public String getNombre() { return nombre; }
    public void setNombre(String v) { this.nombre = v; }
    public String getApellido() { return apellido; }
    public void setApellido(String v) { this.apellido = v; }
    public LocalDate getFechaNacimiento() { return fechaNacimiento; }
    public void setFechaNacimiento(LocalDate v) { this.fechaNacimiento = v; }
    public String getTipoDocumento() { return tipoDocumento; }
    public void setTipoDocumento(String v) { this.tipoDocumento = v; }
    public String getNumeroDocumento() { return numeroDocumento; }
    public void setNumeroDocumento(String v) { this.numeroDocumento = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getTelefono() { return telefono; }
    public void setTelefono(String v) { this.telefono = v; }
    public String getDireccion() { return direccion; }
    public void setDireccion(String v) { this.direccion = v; }
    public String getCargo() { return cargo; }
    public void setCargo(String v) { this.cargo = v; }
    public String getDepartamento() { return departamento; }
    public void setDepartamento(String v) { this.departamento = v; }
    public LocalDate getFechaContratacion() { return fechaContratacion; }
    public void setFechaContratacion(LocalDate v) { this.fechaContratacion = v; }
    public LocalDate getFechaTerminacion() { return fechaTerminacion; }
    public void setFechaTerminacion(LocalDate v) { this.fechaTerminacion = v; }
    public String getEstado() { return estado; }
    public void setEstado(String v) { this.estado = v; }
    public void setActivo(Boolean v) { this.activo = v; }
    public String getTipoContrato() { return tipoContrato; }
    public void setTipoContrato(String v) { this.tipoContrato = v; }
    public LocalDate getFinContrato() { return finContrato; }
    public void setFinContrato(LocalDate v) { this.finContrato = v; }
    public Integer getHorasSemanales() { return horasSemanales; }
    public void setHorasSemanales(Integer v) { this.horasSemanales = v; }
    public void setSalario(BigDecimal v) { this.salario = v; }
    public String getEps() { return eps; }
    public void setEps(String v) { this.eps = v; }
    public String getFondoPension() { return fondoPension; }
    public void setFondoPension(String v) { this.fondoPension = v; }
    public String getArl() { return arl; }
    public void setArl(String v) { this.arl = v; }
    public String getRiesgoArl() { return riesgoArl; }
    public void setRiesgoArl(String v) { this.riesgoArl = v; }
    public String getCajaCompensacion() { return cajaCompensacion; }
    public void setCajaCompensacion(String v) { this.cajaCompensacion = v; }
    public String getBanco() { return banco; }
    public void setBanco(String v) { this.banco = v; }
    public String getTipoCuenta() { return tipoCuenta; }
    public void setTipoCuenta(String v) { this.tipoCuenta = v; }
    public String getNumeroCuenta() { return numeroCuenta; }
    public void setNumeroCuenta(String v) { this.numeroCuenta = v; }
    public Long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(Long v) { this.usuarioId = v; }
    public void setFechaCreacion(LocalDateTime v) { this.fechaCreacion = v; }
    public void setFechaModificacion(LocalDateTime v) { this.fechaModificacion = v; }
    public String getSogoDatos() { return sogoDatos; }
    public void setSogoDatos(String v) { this.sogoDatos = v; }
    public List<Salario> getSalarios() { return salarios; }
    public List<EmpleadoDeduccion> getDeducciones() { return deducciones; }

    public String claveOId() {
        return clave != null && !clave.isBlank() ? clave : "x" + id;
    }
}
