package com.sogo.repository;

import com.sogo.entity.TarifaReserva;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TarifaReservaRepository extends JpaRepository<TarifaReserva, Long> {
    Optional<TarifaReserva> findByTipoReserva(String tipoReserva);
}
