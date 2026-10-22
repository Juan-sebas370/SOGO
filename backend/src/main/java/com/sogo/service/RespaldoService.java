package com.sogo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.ResultSetMetaData;
import java.sql.Types;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;
import java.util.zip.GZIPOutputStream;

import static org.springframework.http.HttpStatus.*;

/**
 * Respaldos reales de la base de datos (hotel_sebastian completa: SOGO y la página web).
 *
 *  · Cada respaldo es un archivo .sql.gz en la carpeta del servidor (backend/respaldos por defecto):
 *    estructura y datos de cada tabla, listo para restaurar con MySQL Workbench (Data Import) o
 *    con la consola de mysql. Incluye los archivos de soporte y los datos personales: no se comparte.
 *  · Automático según la política (configuracion 'politica_datos': Diario 02:00, Diario 23:00,
 *    Semanal domingo 02:00 o Apagado). Solo corre mientras el backend esté encendido.
 *  · Se conservan los N más recientes (backupKeep); los más viejos se borran.
 *  · El último resultado (correcto o con error) queda en configuracion 'respaldos_estado'.
 */
@Service
public class RespaldoService {

    private static final Logger log = LoggerFactory.getLogger(RespaldoService.class);
    private static final DateTimeFormatter NOMBRE = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");
    private static final Pattern ARCHIVO = Pattern.compile("^sogo-(manual|auto)-\\d{8}-\\d{6}\\.sql\\.gz$");
    public static final String POLITICA = "politica_datos";
    private static final String ESTADO = "respaldos_estado";

    private final JdbcTemplate jdbc;
    private final ConfiguracionService config;
    private final ObjectMapper json;
    private final Path carpeta;

    public RespaldoService(JdbcTemplate jdbc, ConfiguracionService config, ObjectMapper json,
                           @Value("${app.respaldos.dir:respaldos}") String dir) {
        this.jdbc = jdbc;
        this.config = config;
        this.json = json;
        this.carpeta = Paths.get(dir).toAbsolutePath().normalize();
    }

    public String carpeta() { return carpeta.toString(); }

    // ── Consulta ─────────────────────────────────────────

    public List<Map<String, Object>> listar() {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!Files.isDirectory(carpeta)) return out;
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(carpeta, "sogo-*.sql.gz")) {
            for (Path p : ds) {
                String nombre = p.getFileName().toString();
                if (!ARCHIVO.matcher(nombre).matches()) continue;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("name", nombre);
                m.put("kind", nombre.startsWith("sogo-auto-") ? "Automático" : "Manual");
                LocalDateTime fecha = LocalDateTime.parse(nombre.replaceAll("^sogo-(manual|auto)-|\\.sql\\.gz$", ""), NOMBRE);
                m.put("at", fecha.toString().substring(0, 16));
                m.put("bytes", Files.size(p));
                m.put("_orden", fecha);
                out.add(m);
            }
        } catch (IOException e) {
            throw new ResponseStatusException(INTERNAL_SERVER_ERROR, "No se pudo leer la carpeta de respaldos");
        }
        // Más reciente primero, hasta el segundo (varios respaldos pueden caer en el mismo minuto)
        out.sort((a, b) -> ((LocalDateTime) b.get("_orden")).compareTo((LocalDateTime) a.get("_orden")));
        out.forEach(m -> m.remove("_orden"));
        return out;
    }

    public JsonNode estado() {
        return config.leer(ESTADO).orElse(json.createObjectNode());
    }

    /** Archivo para descargar (solo nombres válidos dentro de la carpeta: nada de rutas). */
    public Path archivo(String nombre) {
        if (nombre == null || !ARCHIVO.matcher(nombre).matches()) throw new ResponseStatusException(BAD_REQUEST, "Nombre de respaldo no válido");
        Path p = carpeta.resolve(nombre).normalize();
        if (!p.startsWith(carpeta) || !Files.isRegularFile(p)) throw new ResponseStatusException(NOT_FOUND, "El respaldo no existe");
        return p;
    }

    // ── Generación ───────────────────────────────────────

    /** Genera un respaldo ahora. Devuelve el respaldo creado; si falla, deja el error en el estado. */
    public synchronized Map<String, Object> respaldar(boolean automatico, String quien) {
        LocalDateTime ahora = LocalDateTime.now().withNano(0);
        String nombre = "sogo-" + (automatico ? "auto" : "manual") + "-" + ahora.format(NOMBRE) + ".sql.gz";
        Path destino = carpeta.resolve(nombre);
        Path temporal = carpeta.resolve(nombre + ".parcial");
        try {
            Files.createDirectories(carpeta);
            int tablas = escribir(temporal, ahora, quien);
            Files.move(temporal, destino, StandardCopyOption.REPLACE_EXISTING);
            depurar();
            guardarEstado(ahora, automatico, true, nombre + " · " + tablas + " tablas · " + Files.size(destino) + " bytes", quien);
            log.info("Respaldo creado: {}", destino);
            return listar().stream().filter(m -> nombre.equals(m.get("name"))).findFirst().orElse(Map.of("name", nombre));
        } catch (Exception e) {
            try { Files.deleteIfExists(temporal); } catch (IOException ignored) { }
            String motivo = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            guardarEstado(ahora, automatico, false, motivo, quien);
            log.error("No se pudo crear el respaldo: {}", motivo);
            throw new ResponseStatusException(INTERNAL_SERVER_ERROR, "No se pudo crear el respaldo: " + motivo);
        }
    }

    private int escribir(Path archivo, LocalDateTime ahora, String quien) throws IOException {
        List<String> tablas = jdbc.queryForList("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() "
                + "AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME", String.class);
        String base = jdbc.queryForObject("SELECT DATABASE()", String.class);
        try (Writer w = new BufferedWriter(new OutputStreamWriter(new GZIPOutputStream(Files.newOutputStream(archivo)), StandardCharsets.UTF_8))) {
            w.write("-- Respaldo de SOGO · base " + base + " · " + ahora.toString().replace('T', ' ') + (quien == null ? "" : " · " + quien) + "\n");
            w.write("-- Restaurar: MySQL Workbench › Server › Data Import (o mysql < archivo.sql). Reemplaza las tablas.\n");
            w.write("-- Los disparadores (triggers) se recrean con database/01c_triggers_reservas.sql.\n\n");
            w.write("SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n");
            for (String t : tablas) {
                String crear = jdbc.queryForObject("SHOW CREATE TABLE `" + t + "`", (rs, i) -> rs.getString(2));
                w.write("DROP TABLE IF EXISTS `" + t + "`;\n" + crear + ";\n\n");
                volcar(w, t);
            }
            w.write("SET FOREIGN_KEY_CHECKS = 1;\n");
        }
        return tablas.size();
    }

    /** Datos de una tabla en INSERT de hasta 200 filas. */
    private void volcar(Writer w, String tabla) {
        final StringBuilder lote = new StringBuilder();
        final int[] filas = {0};
        jdbc.query("SELECT * FROM `" + tabla + "`", rs -> {
            ResultSetMetaData md = rs.getMetaData();
            int n = md.getColumnCount();
            StringBuilder fila = new StringBuilder("(");
            for (int c = 1; c <= n; c++) {
                if (c > 1) fila.append(',');
                fila.append(valor(rs.getObject(c), md.getColumnType(c)));
            }
            fila.append(')');
            if (filas[0] % 200 == 0) {
                if (lote.length() > 0) lote.append(";\n");
                lote.append("INSERT INTO `").append(tabla).append("` VALUES ");
            } else lote.append(",\n");
            lote.append(fila);
            filas[0]++;
            if (lote.length() > 1_000_000) {
                // Lote grande (archivos de soporte): se escribe ya, cerrando su INSERT
                try { w.write(lote + ";\n"); } catch (IOException e) { throw new UncheckedIOException(e); }
                lote.setLength(0);
                filas[0] = 0;
            }
        });
        try {
            if (lote.length() > 0) w.write(lote + ";\n");
            w.write("\n");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String valor(Object v, int tipo) {
        if (v == null) return "NULL";
        if (v instanceof byte[] b) {
            if (b.length == 0) return "''";
            StringBuilder sb = new StringBuilder("0x");
            for (byte x : b) sb.append(String.format("%02x", x));
            return sb.toString();
        }
        if (v instanceof Boolean bo) return bo ? "1" : "0";
        if (v instanceof Number && tipo != Types.CHAR && tipo != Types.VARCHAR) return v.toString();
        String s = v instanceof java.sql.Timestamp ts ? ts.toLocalDateTime().toString().replace('T', ' ') : v.toString();
        StringBuilder sb = new StringBuilder("'");
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '\\' -> sb.append("\\\\");
                case '\'' -> sb.append("\\'");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\0' -> sb.append("\\0");
                case 26 -> sb.append("\\Z");
                default -> sb.append(ch);
            }
        }
        return sb.append('\'').toString();
    }

    /** Conserva los N respaldos más recientes (política backupKeep); borra los demás. */
    private void depurar() throws IOException {
        int conservar = config.leer(POLITICA).map(p -> p.path("backupKeep").asInt(0)).orElse(0);
        if (conservar <= 0) return;
        List<Map<String, Object>> todos = listar();
        for (int i = conservar; i < todos.size(); i++) Files.deleteIfExists(carpeta.resolve((String) todos.get(i).get("name")));
    }

    private void guardarEstado(LocalDateTime at, boolean automatico, boolean ok, String detalle, String quien) {
        ObjectNode e = json.createObjectNode();
        e.put("at", at.toString().substring(0, 16));
        e.put("kind", automatico ? "Automático" : "Manual");
        e.put("ok", ok);
        e.put("detail", detalle.length() > 400 ? detalle.substring(0, 400) : detalle);
        if (quien != null) e.put("by", quien);
        config.guardar(ESTADO, e, null);
    }

    // ── Respaldo automático ──────────────────────────────

    /** Cada minuto revisa si toca el respaldo automático según la política guardada. */
    @Scheduled(cron = "0 * * * * *")
    public void automatico() {
        try {
            JsonNode p = config.leer(POLITICA).orElse(null);
            if (p == null) return;
            String plan = p.path("backupSchedule").asText("Apagado");
            LocalDateTime ahora = LocalDateTime.now();
            LocalTime hora;
            if (plan.startsWith("Diario · 02:00")) hora = LocalTime.of(2, 0);
            else if (plan.startsWith("Diario · 23:00")) hora = LocalTime.of(23, 0);
            else if (plan.startsWith("Semanal")) {
                if (ahora.getDayOfWeek() != DayOfWeek.SUNDAY) return;
                hora = LocalTime.of(2, 0);
            } else return;
            if (ahora.getHour() != hora.getHour() || ahora.getMinute() != hora.getMinute()) return;
            boolean yaHoy = listar().stream().anyMatch(m -> "Automático".equals(m.get("kind")) && ((String) m.get("at")).startsWith(ahora.toLocalDate().toString()));
            if (yaHoy) return;
            respaldar(true, "Respaldo automático");
        } catch (Exception e) {
            log.error("Falló el respaldo automático: {}", e.getMessage());
        }
    }
}
