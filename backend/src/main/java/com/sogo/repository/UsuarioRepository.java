package com.sogo.repository;

import com.sogo.entity.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {
    Optional<Usuario> findByUsernameIgnoreCase(String username);
    Optional<Usuario> findByEmailIgnoreCase(String email);
    Optional<Usuario> findByResetToken(String resetToken);
    Optional<Usuario> findByClave(String clave);
}
