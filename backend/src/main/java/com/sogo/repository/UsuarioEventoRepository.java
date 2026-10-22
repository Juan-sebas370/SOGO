package com.sogo.repository;

import com.sogo.entity.UsuarioEvento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UsuarioEventoRepository extends JpaRepository<UsuarioEvento, Long> {
    List<UsuarioEvento> findAllByOrderByIdDesc();
}
