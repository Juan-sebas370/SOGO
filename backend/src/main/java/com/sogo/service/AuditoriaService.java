package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sogo.entity.Auditoria;
import com.sogo.repository.AuditoriaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Bitácora de auditoría encadenada. El servidor es el único que firma: así la cadena
 * es una sola aunque varias personas usen SOGO a la vez. La firma es la misma del
 * frontend (users.model.ts: digest / eventHash) para que "Verificar integridad" funcione.
 */
@Service
public class AuditoriaService {

    private static final DateTimeFormatter SEGUNDO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String CERO = "0".repeat(16);

    private final AuditoriaRepository auditoria;
    private final ObjectMapper json;

    public AuditoriaService(AuditoriaRepository auditoria, ObjectMapper json) {
        this.auditoria = auditoria;
        this.json = json;
    }

    /** Evento con la forma de `AuditEvent` del frontend. */
    public record Evento(String user, String module, String action, String detail, String object,
                         String result, JsonNode changes, String reason, String device) {}

    @Transactional
    public synchronized ObjectNode registrar(Evento e, Long usuarioId, String ip) {
        Auditoria ultimo = auditoria.findFirstByOrderByIdDesc().orElse(null);
        long n = ultimo == null ? 1 : ultimo.getId() + 1;
        LocalDateTime ahora = LocalDateTime.now().withNano(0);

        Auditoria a = new Auditoria();
        a.setCodigo(String.format("EVT-%d-%07d", ahora.getYear(), 917000 + n));
        a.setFecha(ahora);
        a.setUsuarioId(usuarioId);
        a.setUsername(texto(e.user(), "sistema"));
        a.setIp(texto(ip, ""));
        a.setDispositivo(texto(e.device(), ""));
        a.setModulo(texto(e.module(), "Sistema"));
        a.setAccion(texto(e.action(), ""));
        a.setDetalle(texto(e.detail(), ""));
        a.setObjeto(e.object());
        a.setResultado(texto(e.result(), "Exitoso"));
        a.setCambios(e.changes() == null || e.changes().isNull() ? null : e.changes().toString());
        a.setMotivo(e.reason());
        a.setHashAnterior(ultimo == null ? CERO : ultimo.getHash().trim());
        a.setHash(firma(a));
        return toDto(auditoria.save(a));
    }

    /** Eventos en orden cronológico (los más recientes, hasta 5000). */
    @Transactional(readOnly = true)
    public List<ObjectNode> listar() {
        List<ObjectNode> lista = new ArrayList<>(auditoria.findTop5000ByOrderByIdDesc().stream().map(this::toDto).toList());
        Collections.reverse(lista);
        return lista;
    }

    private String firma(Auditoria a) {
        return digest(a.getHashAnterior() + "|" + a.getCodigo() + "|" + a.getFecha().format(SEGUNDO) + "|" + a.getUsername() + "|"
                + a.getModulo() + "|" + a.getAccion() + "|" + a.getDetalle() + "|" + a.getResultado());
    }

    /** FNV-1a de 64 bits en hexadecimal: misma función que `digest` de users.model.ts. */
    static String digest(String text) {
        int h1 = 0x811c9dc5, h2 = 0x01000193;
        for (int i = 0; i < text.length(); i++) {
            int c = text.charAt(i);
            h1 = (h1 ^ c) * 0x01000193;
            h2 = (h2 ^ c) * 0x811c9dc5;
        }
        return String.format("%08x%08x", h1 & 0xffffffffL, h2 & 0xffffffffL);
    }

    private ObjectNode toDto(Auditoria a) {
        ObjectNode o = json.createObjectNode();
        o.put("id", a.getCodigo());
        o.put("at", a.getFecha().format(SEGUNDO));
        o.put("user", a.getUsername());
        o.put("ip", a.getIp());
        o.put("device", a.getDispositivo());
        o.put("module", a.getModulo());
        o.put("action", a.getAccion());
        o.put("detail", a.getDetalle());
        if (a.getObjeto() != null) o.put("object", a.getObjeto());
        o.put("result", a.getResultado());
        if (a.getCambios() != null) {
            try { o.set("changes", json.readTree(a.getCambios())); } catch (Exception ignored) { }
        }
        if (a.getMotivo() != null) o.put("reason", a.getMotivo());
        o.put("hash", a.getHash().trim());
        o.put("prevHash", a.getHashAnterior() == null ? CERO : a.getHashAnterior().trim());
        return o;
    }

    private static String texto(String v, String porDefecto) {
        return v == null ? porDefecto : v;
    }
}
