package com.sogo.repository;

import com.sogo.entity.Empleado;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EmpleadoRepository extends JpaRepository<Empleado, Long> {
    Optional<Empleado> findByClave(String clave);
    List<Empleado> findByUsuarioId(Long usuarioId);
}
