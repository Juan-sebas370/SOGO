package com.sogo.config;

import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.MimeMessageHelper;

import java.util.List;
import java.util.Map;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.*;

class ResendMailSenderTest {

    private final ResendMailSender sender = new ResendMailSender("clave", "reservas@hospedaje.com");

    @Test
    @DisplayName("traduce el correo con su remitente, HTML y adjunto (reportes y facturas en PDF)")
    @SuppressWarnings("unchecked")
    void cuerpoConAdjunto() throws Exception {
        MimeMessage m = new MimeMessage(Session.getInstance(new Properties()));
        MimeMessageHelper h = new MimeMessageHelper(m, true, "UTF-8");
        h.setFrom(new InternetAddress("otra@cuenta.com", "Hospedaje Sebastián", "UTF-8"));
        h.setTo("huesped@correo.com");
        h.setSubject("Factura FE-1");
        h.setText("texto", "<b>html</b>");
        h.addAttachment("FE-1.pdf", new ByteArrayResource(new byte[] { 1, 2, 3 }), "application/pdf");

        Map<String, Object> c = sender.cuerpo(m);

        assertTrue(c.get("from").toString().contains("reservas@hospedaje.com"), "El remitente es siempre el dominio verificado");
        assertTrue(c.get("from").toString().contains("Hospedaje Sebastián"));
        assertEquals(List.of("huesped@correo.com"), c.get("to"));
        assertEquals("<b>html</b>", c.get("html"));
        assertEquals("texto", c.get("text"));
        Map<String, String> adjunto = ((List<Map<String, String>>) c.get("attachments")).get(0);
        assertEquals("FE-1.pdf", adjunto.get("filename"));
        assertEquals("AQID", adjunto.get("content"));
    }
}
