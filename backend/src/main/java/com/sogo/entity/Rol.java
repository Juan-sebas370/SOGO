package com.sogo.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Rol de SOGO (tabla `roles`) con sus permisos por módulo (`rol_permisos`). */
@Entity
@Table(name = "roles")
public class Rol {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String clave;               // id que usa el frontend: admin, recep, r…
    private String nombre;
    private String descripcion;
    private String nivel;               // Total | Operador | Consulta
    private String color;
    private Long rolPadreId;
    private Boolean bloqueado;          // rol crítico (Administrador)
    private LocalDateTime fechaModificacion;
    private Long modificadoPor;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "rol_permisos", joinColumns = @JoinColumn(name = "rol_id"))
    private List<Permiso> permisos = new ArrayList<>();

    @Embeddable
    public static class Permiso {
        private String modulo;
        private Boolean ver;
        private Boolean crear;
        private Boolean editar;
        private Boolean eliminar;
        private Boolean exportar;
        private String alcance;

        public Permiso() {}
        public Permiso(String modulo, boolean ver, boolean crear, boolean editar, boolean eliminar, boolean exportar, String alcance) {
            this.modulo = modulo; this.ver = ver; this.crear = crear; this.editar = editar;
            this.eliminar = eliminar; this.exportar = exportar; this.alcance = alcance;
        }
        public String getModulo() { return modulo; }
        public boolean isVer() { return Boolean.TRUE.equals(ver); }
        public boolean isCrear() { return Boolean.TRUE.equals(crear); }
        public boolean isEditar() { return Boolean.TRUE.equals(editar); }
        public boolean isEliminar() { return Boolean.TRUE.equals(eliminar); }
        public boolean isExportar() { return Boolean.TRUE.equals(exportar); }
        public String getAlcance() { return alcance; }

        /** Acción del frontend: view | create | edit | delete | export. */
        public boolean permite(String accion) {
            return switch (accion) {
                case "view" -> isVer();
                case "create" -> isCrear();
                case "edit" -> isEditar();
                case "delete" -> isEliminar();
                case "export" -> isExportar();
                default -> false;
            };
        }
    }

    public Long getId() { return id; }
    public String getClave() { return clave; }
    public void setClave(String v) { this.clave = v; }
    public String getNombre() { return nombre; }
    public void setNombre(String v) { this.nombre = v; }
    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String v) { this.descripcion = v; }
    public String getNivel() { return nivel; }
    public void setNivel(String v) { this.nivel = v; }
    public String getColor() { return color; }
    public void setColor(String v) { this.color = v; }
    public Long getRolPadreId() { return rolPadreId; }
    public void setRolPadreId(Long v) { this.rolPadreId = v; }
    public Boolean getBloqueado() { return bloqueado; }
    public void setBloqueado(Boolean v) { this.bloqueado = v; }
    public LocalDateTime getFechaModificacion() { return fechaModificacion; }
    public void setFechaModificacion(LocalDateTime v) { this.fechaModificacion = v; }
    public Long getModificadoPor() { return modificadoPor; }
    public void setModificadoPor(Long v) { this.modificadoPor = v; }
    public List<Permiso> getPermisos() { return permisos; }

    public String claveOId() {
        return clave != null && !clave.isBlank() ? clave : "r" + id;
    }
}
