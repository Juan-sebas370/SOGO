package com.sogo.repository;

import com.sogo.entity.Nomina;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface NominaRepository extends JpaRepository<Nomina, Long> {
    Optional<Nomina> findByClave(String clave);
}
