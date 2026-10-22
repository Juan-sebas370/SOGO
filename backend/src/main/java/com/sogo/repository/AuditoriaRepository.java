package com.sogo.repository;

import com.sogo.entity.Auditoria;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AuditoriaRepository extends JpaRepository<Auditoria, Long> {
    Optional<Auditoria> findFirstByOrderByIdDesc();
    List<Auditoria> findTop5000ByOrderByIdDesc();
}
