package com.sogo.repository;

import com.sogo.entity.Pago;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PagoRepository extends JpaRepository<Pago, Long> {
    List<Pago> findByEstadoOrderByFechaPagoAsc(String estado);
    List<Pago> findByReservaIdAndEstadoOrderByFechaPagoAsc(Long reservaId, String estado);
}
