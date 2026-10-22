package com.sogo.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/** Ajustes de SOGO por clave (política de seguridad, auditoría...), en JSON. */
@Entity
@Table(name = "configuracion")
@SuppressWarnings("unused") // columnas de la BD compartida que este código no lee
public class Configuracion {
    @Id
    private String clave;
    private String valor;
    private LocalDateTime fechaModificacion;
    private Long modificadoPor;

    public Configuracion() {}
    public Configuracion(String clave) { this.clave = clave; }

    public String getClave() { return clave; }
    public String getValor() { return valor; }
    public void setValor(String v) { this.valor = v; }
    public void setFechaModificacion(LocalDateTime v) { this.fechaModificacion = v; }
    public void setModificadoPor(Long v) { this.modificadoPor = v; }
}
