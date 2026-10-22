package com.sogo.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Tabla `usuarios`, compartida con la página web (allí la usa su login de
 * administración). En SOGO son las cuentas del personal; los roles de SOGO
 * van en `usuario_roles`. `clave` es el id que usa el frontend (u…).
 * `sogoDatos` (JSON) guarda lo que no tiene columna: historial de cambios,
 * desactivación programada y quién creó la cuenta.
 */
@Entity
@Table(name = "usuarios")
@SuppressWarnings("unused") // columnas de la BD compartida que este código no lee
public class Usuario {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String clave;
    private String email;
    private String username;
    private String password;
    private String nombre;
    private String apellido;
    private String tipoDocumento;
    private String cedulaIdentidad;
    private String telefono;
    private String cargo;
    private String rol;                 // rol de la web: USER | ADMIN
    private Boolean activo;
    private String estado;              // Activo | Pendiente | Bloqueado | Inactivo
    private Integer intentosFallidos;
    private Boolean debeCambiarPassword;
    private LocalDateTime passwordActualizadaAt;
    private LocalDateTime activacionExpiraAt;
    private LocalDateTime fechaRegistro;
    private LocalDateTime ultimaConexion;
    private String ultimaIp;
    private String proveedorAuth;
    private String resetToken;
    private LocalDateTime resetTokenExpiry;
    private String sogoDatos;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "usuario_roles",
               joinColumns = @JoinColumn(name = "usuario_id"),
               inverseJoinColumns = @JoinColumn(name = "rol_id"))
    private Set<Rol> roles = new LinkedHashSet<>();

    public Long getId() { return id; }
    public String getClave() { return clave; }
    public void setClave(String v) { this.clave = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getUsername() { return username; }
    public void setUsername(String v) { this.username = v; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public String getNombre() { return nombre; }
    public void setNombre(String v) { this.nombre = v; }
    public String getApellido() { return apellido; }
    public void setApellido(String v) { this.apellido = v; }
    public String getTipoDocumento() { return tipoDocumento; }
    public void setTipoDocumento(String v) { this.tipoDocumento = v; }
    public String getCedulaIdentidad() { return cedulaIdentidad; }
    public void setCedulaIdentidad(String v) { this.cedulaIdentidad = v; }
    public String getTelefono() { return telefono; }
    public void setTelefono(String v) { this.telefono = v; }
    public String getCargo() { return cargo; }
    public void setCargo(String v) { this.cargo = v; }
    public String getRol() { return rol; }
    public void setRol(String v) { this.rol = v; }
    public Boolean getActivo() { return activo; }
    public void setActivo(Boolean v) { this.activo = v; }
    public String getEstado() { return estado; }
    public void setEstado(String v) { this.estado = v; }
    public Integer getIntentosFallidos() { return intentosFallidos; }
    public void setIntentosFallidos(Integer intentosFallidos) { this.intentosFallidos = intentosFallidos; }
    public Boolean getDebeCambiarPassword() { return debeCambiarPassword; }
    public void setDebeCambiarPassword(Boolean v) { this.debeCambiarPassword = v; }
    public LocalDateTime getPasswordActualizadaAt() { return passwordActualizadaAt; }
    public void setPasswordActualizadaAt(LocalDateTime v) { this.passwordActualizadaAt = v; }
    public LocalDateTime getActivacionExpiraAt() { return activacionExpiraAt; }
    public void setActivacionExpiraAt(LocalDateTime v) { this.activacionExpiraAt = v; }
    public LocalDateTime getFechaRegistro() { return fechaRegistro; }
    public void setFechaRegistro(LocalDateTime v) { this.fechaRegistro = v; }
    public LocalDateTime getUltimaConexion() { return ultimaConexion; }
    public void setUltimaConexion(LocalDateTime ultimaConexion) { this.ultimaConexion = ultimaConexion; }
    public String getUltimaIp() { return ultimaIp; }
    public void setUltimaIp(String v) { this.ultimaIp = v; }
    public void setProveedorAuth(String v) { this.proveedorAuth = v; }
    public String getResetToken() { return resetToken; }
    public void setResetToken(String resetToken) { this.resetToken = resetToken; }
    public LocalDateTime getResetTokenExpiry() { return resetTokenExpiry; }
    public void setResetTokenExpiry(LocalDateTime resetTokenExpiry) { this.resetTokenExpiry = resetTokenExpiry; }
    public String getSogoDatos() { return sogoDatos; }
    public void setSogoDatos(String v) { this.sogoDatos = v; }
    public Set<Rol> getRoles() { return roles; }

    public String getNombreCompleto() {
        return ((nombre == null ? "" : nombre) + " " + (apellido == null ? "" : apellido)).trim();
    }

    /** Id que usa el frontend: la clave, o "w<id>" si la fila la creó la web. */
    public String claveOId() {
        return clave != null && !clave.isBlank() ? clave : "w" + id;
    }
}
