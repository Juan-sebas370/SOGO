package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sogo.entity.Configuracion;
import com.sogo.repository.ConfiguracionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

/** Ajustes de SOGO guardados como JSON por clave (tabla `configuracion`). */
@Service
public class ConfiguracionService {

    private final ConfiguracionRepository config;
    private final ObjectMapper json;

    public ConfiguracionService(ConfiguracionRepository config, ObjectMapper json) {
        this.config = config;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public Optional<JsonNode> leer(String clave) {
        return config.findById(clave).map(c -> {
            try { return json.readTree(c.getValor()); } catch (Exception e) { return null; }
        });
    }

    @Transactional
    public JsonNode guardar(String clave, JsonNode valor, Long usuarioId) {
        Configuracion c = config.findById(clave).orElseGet(() -> new Configuracion(clave));
        c.setValor(valor.toString());
        c.setFechaModificacion(LocalDateTime.now());
        c.setModificadoPor(usuarioId);
        config.save(c);
        return valor;
    }

    /** Un número de un ajuste JSON, o el valor por defecto si no está configurado. */
    public int entero(String clave, String campo, int porDefecto) {
        return leer(clave).map(v -> v.path(campo)).filter(JsonNode::isNumber).map(JsonNode::asInt).orElse(porDefecto);
    }
}
