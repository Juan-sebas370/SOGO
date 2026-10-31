package com.sogo.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.Address;
import jakarta.mail.BodyPart;
import jakarta.mail.Message;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimePart;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

/**
 * Envía los correos por la API HTTPS de Resend (https://resend.com) en vez de SMTP.
 * Render (plan gratis) bloquea los puertos SMTP 25/465/587, así que en producción
 * Gmail por SMTP no funciona. Los servicios siguen usando JavaMailSender igual:
 * aquí se traduce el MimeMessage (texto, HTML, reply-to e imágenes inline como el QR)
 * al JSON de Resend. El remitente es siempre app.mail.from (dominio verificado en Resend).
 */
public class ResendMailSender extends JavaMailSenderImpl {

    private static final URI API = URI.create("https://api.resend.com/emails");

    private final String apiKey;
    private final String from;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public ResendMailSender(String apiKey, String from) {
        this.apiKey = apiKey;
        this.from = from;
    }

    @Override
    protected void doSend(MimeMessage[] mimeMessages, Object[] originalMessages) {
        Map<Object, Exception> fallos = new LinkedHashMap<>();
        for (int i = 0; i < mimeMessages.length; i++) {
            MimeMessage m = mimeMessages[i];
            try {
                enviar(m);
            } catch (Exception e) {
                fallos.put(originalMessages != null ? originalMessages[i] : m, e);
            }
        }
        if (!fallos.isEmpty()) throw new MailSendException(fallos);
    }

    private void enviar(MimeMessage m) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(API)
                .timeout(Duration.ofSeconds(20))
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(cuerpo(m))))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() / 100 != 2) {
            throw new IllegalStateException("Resend respondió " + res.statusCode() + ": " + res.body());
        }
    }

    /** El JSON que se envía a Resend para este mensaje. */
    Map<String, Object> cuerpo(MimeMessage m) throws Exception {
        // Calcula los Content-Type de cada parte (por SMTP lo hace Transport.send).
        m.saveChanges();
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("from", remitente(m));
        cuerpo.put("to", direcciones(m.getRecipients(Message.RecipientType.TO)));
        List<String> cc = direcciones(m.getRecipients(Message.RecipientType.CC));
        if (!cc.isEmpty()) cuerpo.put("cc", cc);
        List<String> replyTo = direcciones(m.getReplyTo());
        // getReplyTo() devuelve el From cuando no hay Reply-To; ese no se repite.
        if (m.getHeader("Reply-To") != null && !replyTo.isEmpty()) cuerpo.put("reply_to", replyTo);
        cuerpo.put("subject", Objects.toString(m.getSubject(), ""));

        Contenido c = new Contenido();
        leer(m, c);
        if (c.html != null) cuerpo.put("html", c.html);
        if (c.texto != null) cuerpo.put("text", c.texto);
        if (!c.adjuntos.isEmpty()) cuerpo.put("attachments", c.adjuntos);
        return cuerpo;
    }

    /** Conserva el nombre visible del mensaje ("Hospedaje Sebastián") con la dirección configurada. */
    private String remitente(MimeMessage m) throws Exception {
        Address[] desde = m.getFrom();
        if (desde != null && desde.length > 0 && desde[0] instanceof InternetAddress ia && ia.getPersonal() != null) {
            return new InternetAddress(from, ia.getPersonal(), "UTF-8").toUnicodeString();
        }
        return from;
    }

    private static List<String> direcciones(Address[] lista) {
        List<String> r = new ArrayList<>();
        if (lista != null) for (Address a : lista) {
            r.add(a instanceof InternetAddress ia ? ia.getAddress() : a.toString());
        }
        return r;
    }

    private static final class Contenido {
        String texto;
        String html;
        final List<Map<String, String>> adjuntos = new ArrayList<>();
    }

    private static void leer(Part p, Contenido c) throws Exception {
        Object contenido = p.getContent();
        if (contenido instanceof Multipart mp) {
            for (int i = 0; i < mp.getCount(); i++) {
                BodyPart parte = mp.getBodyPart(i);
                leer(parte, c);
            }
            return;
        }
        String contentId = p instanceof MimePart mp ? mp.getContentID() : null;
        boolean adjunto = Part.ATTACHMENT.equalsIgnoreCase(p.getDisposition()) || contentId != null;
        if (!adjunto && p.isMimeType("text/html") && c.html == null) {
            c.html = (String) contenido;
        } else if (!adjunto && p.isMimeType("text/plain") && c.texto == null) {
            c.texto = (String) contenido;
        } else {
            Map<String, String> a = new LinkedHashMap<>();
            String tipo = p.getContentType().split(";")[0].trim();
            String nombre = p.getFileName() != null ? p.getFileName()
                    : (contentId != null ? contentId.replaceAll("[<>]", "") : "adjunto") + extension(tipo);
            a.put("filename", nombre);
            a.put("content", Base64.getEncoder().encodeToString(bytes(p)));
            a.put("content_type", tipo);
            // Imagen inline (<img src="cid:qr">): Resend la incrusta con content_id.
            if (contentId != null) a.put("content_id", contentId.replaceAll("[<>]", ""));
            c.adjuntos.add(a);
        }
    }

    private static String extension(String tipo) {
        return switch (tipo) {
            case "image/png" -> ".png";
            case "image/jpeg" -> ".jpg";
            case "application/pdf" -> ".pdf";
            default -> "";
        };
    }

    private static byte[] bytes(Part p) throws Exception {
        try (InputStream in = p.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            in.transferTo(out);
            return out.toByteArray();
        }
    }
}
