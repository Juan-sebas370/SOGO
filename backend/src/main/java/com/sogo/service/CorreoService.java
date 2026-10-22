package com.sogo.service;

import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;

/**
 * Envío de correos de SOGO por SMTP (Gmail). La cuenta y su contraseña de aplicación van en
 * backend/correo.local.properties (ver correo.local.ejemplo.properties); sin ese archivo SOGO
 * arranca igual, pero no envía correos.
 */
@Service
public class CorreoService {

    private static final Logger log = LoggerFactory.getLogger(CorreoService.class);

    private final ObjectProvider<JavaMailSender> sender;

    @Value("${spring.mail.username:}")
    private String cuenta;
    @Value("${spring.mail.password:}")
    private String clave;
    @Value("${spring.mail.host:}")
    private String servidor;
    @Value("${app.mail.from-name:}")
    private String nombreRemitente;

    private final ConfiguracionService config;
    /** Último error al enviar (para mostrarlo en Configuración); vacío si el último envío salió bien. */
    private volatile String ultimoError = "";

    public CorreoService(ObjectProvider<JavaMailSender> sender, ConfiguracionService config) {
        this.sender = sender;
        this.config = config;
    }

    /** ¿Hay cuenta y contraseña de aplicación en correo.local.properties? */
    public boolean configurado() {
        return sender.getIfAvailable() != null && cuenta != null && !cuenta.isBlank()
                && clave != null && !clave.isBlank() && !clave.startsWith("PEGA_AQUI");
    }

    public String cuenta() { return cuenta == null ? "" : cuenta; }
    public String servidor() { return servidor == null ? "" : servidor; }
    public String ultimoError() { return ultimoError; }

    /** Qué falta para poder enviar (vacío si está todo). */
    public String faltante() {
        if (cuenta == null || cuenta.isBlank()) return "Falta crear backend/correo.local.properties con la cuenta de Gmail del hospedaje";
        if (clave == null || clave.isBlank() || clave.startsWith("PEGA_AQUI")) return "Falta pegar la contraseña de aplicación de Gmail en backend/correo.local.properties y reiniciar el backend";
        return "";
    }

    /** Nombre que ve quien recibe el correo: el del hospedaje (Configuración › Datos del hospedaje). */
    public String remitente() {
        if (nombreRemitente != null && !nombreRemitente.isBlank()) return nombreRemitente;
        return config.leer("hospedaje").map(h -> h.path("commercialName").asText("")).filter(n -> !n.isBlank()).orElse("SOGO");
    }

    /** Correo de prueba: devuelve "" si salió, o el motivo si no. */
    public String probar(String para) {
        if (!configurado()) return faltante();
        String html = """
            <div style="font-family:Arial,Helvetica,sans-serif;padding:20px;color:#1F2937">
              <h2 style="margin:0 0 8px;color:#0A3D6D">Correo de prueba de SOGO</h2>
              <p style="margin:0">Si lees este mensaje, %s ya puede enviar facturas, avisos y enlaces para recuperar la contraseña.</p>
            </div>""".formatted(esc(remitente()));
        boolean ok = enviar(para, "Correo de prueba · " + remitente(), "Si lees este mensaje, SOGO ya puede enviar correos.", html);
        return ok ? "" : (ultimoError.isBlank() ? "No se pudo enviar" : ultimoError);
    }

    /** Enlace para restablecer la contraseña (vence en 1 hora). Devuelve false si no se pudo enviar. */
    public boolean enviarRecuperacion(String para, String nombre, String enlace) {
        String saludo = nombre == null || nombre.isBlank() ? "Hola" : "Hola " + esc(nombre.split("\\s+")[0]);
        String html = """
            <div style="font-family:Arial,Helvetica,sans-serif;background:#F4F7FB;padding:28px 12px">
              <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E6EBF2">
                <div style="background:#0A3D6D;padding:20px 26px;color:#ffffff">
                  <div style="font-size:20px;font-weight:bold;letter-spacing:.5px">SOGO</div>
                  <div style="font-size:12px;opacity:.85">%s</div>
                </div>
                <div style="padding:26px;color:#1F2937;font-size:14px;line-height:1.6">
                  <p style="margin:0 0 12px">%s,</p>
                  <p style="margin:0 0 18px">Recibimos una solicitud para restablecer la contraseña de tu cuenta en SOGO.
                    Pulsa el botón para crear una nueva. El enlace sirve <b>una sola vez</b> y vence en <b>1 hora</b>.</p>
                  <p style="text-align:center;margin:0 0 22px">
                    <a href="%s" style="display:inline-block;background:#0B6FD0;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 26px;border-radius:10px">Restablecer contraseña</a>
                  </p>
                  <p style="margin:0 0 8px;font-size:12px;color:#6B7280">Si el botón no funciona, copia este enlace en el navegador:</p>
                  <p style="margin:0 0 18px;font-size:12px;word-break:break-all"><a href="%s" style="color:#0B6FD0">%s</a></p>
                  <p style="margin:0;font-size:12px;color:#6B7280">Si no fuiste tú, ignora este correo: tu contraseña no cambia.</p>
                </div>
              </div>
            </div>""".formatted(esc(remitente()), saludo, enlace, enlace, esc(enlace));
        String texto = saludo + ",\n\nPara restablecer tu contraseña de SOGO abre este enlace (sirve una vez y vence en 1 hora):\n"
                + enlace + "\n\nSi no fuiste tú, ignora este correo.\n\n" + remitente() + " · SOGO";
        return enviar(para, "Restablece tu contraseña de SOGO", texto, html);
    }

    /** Correo con contenido HTML propio (p. ej. una factura). Varios destinatarios separados por coma. */
    public boolean enviarHtml(String para, String asunto, String texto, String html) {
        return enviar(para, asunto, texto, html, null, null, null);
    }

    /** Correo HTML con un archivo adjunto (p. ej. un reporte programado). */
    public boolean enviarConAdjunto(String para, String asunto, String texto, String html, String archivo, String tipo, byte[] datos) {
        return enviar(para, asunto, texto, html, archivo, tipo, datos);
    }

    private boolean enviar(String para, String asunto, String texto, String html) {
        return enviar(para, asunto, texto, html, null, null, null);
    }

    private boolean enviar(String para, String asunto, String texto, String html, String archivo, String tipo, byte[] datos) {
        JavaMailSender mail = sender.getIfAvailable();
        if (mail == null || !configurado()) {
            ultimoError = faltante();
            log.warn("No hay correo configurado (correo.local.properties): no se envió «{}» a {}", asunto, para);
            return false;
        }
        try {
            MimeMessage m = mail.createMimeMessage();
            MimeMessageHelper h = new MimeMessageHelper(m, true, StandardCharsets.UTF_8.name());
            h.setFrom(new InternetAddress(cuenta, remitente(), StandardCharsets.UTF_8.name()));
            h.setTo(InternetAddress.parse(para));
            h.setSubject(asunto);
            h.setText(texto, html);
            if (archivo != null && datos != null) h.addAttachment(archivo, new org.springframework.core.io.ByteArrayResource(datos), tipo);
            mail.send(m);
            ultimoError = "";
            log.info("Correo «{}» enviado a {}", asunto, para);
            return true;
        } catch (Exception e) {
            ultimoError = explicar(e);
            log.error("No se pudo enviar «{}» a {}: {}", asunto, para, e.getMessage());
            return false;
        }
    }

    /** El error de Gmail en palabras de la persona que configura. */
    private static String explicar(Exception e) {
        String m = String.valueOf(e.getMessage());
        Throwable c = e;
        while (c.getCause() != null) { c = c.getCause(); m += " " + c.getMessage(); }
        if (m.contains("535") || m.contains("Username and Password not accepted") || m.contains("AuthenticationFailed"))
            return "Gmail rechazó la cuenta o la contraseña de aplicación: créala de nuevo en https://myaccount.google.com/apppasswords y pégala sin espacios";
        if (m.contains("UnknownHost") || m.contains("Couldn't connect") || m.contains("timed out") || m.contains("Connection refused"))
            return "No hay conexión con el servidor de Gmail (revisa el internet del equipo donde corre SOGO)";
        if (m.contains("Invalid Addresses") || m.contains("AddressException"))
            return "La dirección de correo del destinatario no es válida";
        return "Gmail no aceptó el envío: " + m.trim();
    }

    private static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
