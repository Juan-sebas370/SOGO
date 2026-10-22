package com.sogo.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/** Evento de auditoría. Cada uno guarda el hash del anterior: si alguien altera uno, la cadena se rompe. */
@Entity
@Table(name = "auditoria")
@SuppressWarnings("unused") // columnas de la BD compartida que este código no lee
public class Auditoria {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String codigo;
    private LocalDateTime fecha;
    private Long usuarioId;
    private String username;
    private String ip;
    private String dispositivo;
    private String modulo;
    private String accion;
    private String detalle;
    private String objeto;
    private String resultado;
    private String cambios;             // JSON [{label, before, after}]
    private String motivo;
    private String hash;
    private String hashAnterior;

    public Long getId() { return id; }
    public String getCodigo() { return codigo; }
    public void setCodigo(String v) { this.codigo = v; }
    public LocalDateTime getFecha() { return fecha; }
    public void setFecha(LocalDateTime v) { this.fecha = v; }
    public void setUsuarioId(Long v) { this.usuarioId = v; }
    public String getUsername() { return username; }
    public void setUsername(String v) { this.username = v; }
    public String getIp() { return ip; }
    public void setIp(String v) { this.ip = v; }
    public String getDispositivo() { return dispositivo; }
    public void setDispositivo(String v) { this.dispositivo = v; }
    public String getModulo() { return modulo; }
    public void setModulo(String v) { this.modulo = v; }
    public String getAccion() { return accion; }
    public void setAccion(String v) { this.accion = v; }
    public String getDetalle() { return detalle; }
    public void setDetalle(String v) { this.detalle = v; }
    public String getObjeto() { return objeto; }
    public void setObjeto(String v) { this.objeto = v; }
    public String getResultado() { return resultado; }
    public void setResultado(String v) { this.resultado = v; }
    public String getCambios() { return cambios; }
    public void setCambios(String v) { this.cambios = v; }
    public String getMotivo() { return motivo; }
    public void setMotivo(String v) { this.motivo = v; }
    public String getHash() { return hash; }
    public void setHash(String v) { this.hash = v; }
    public String getHashAnterior() { return hashAnterior; }
    public void setHashAnterior(String v) { this.hashAnterior = v; }
}
