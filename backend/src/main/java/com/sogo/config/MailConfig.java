package com.sogo.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;

/**
 * Con RESEND_API_KEY definida, los correos salen por la API HTTPS de Resend (producción en Render,
 * que bloquea SMTP en el plan gratis). Sin ella, Spring Boot configura el SMTP de spring.mail.* (Gmail).
 */
@Configuration
public class MailConfig {

    @Bean
    @ConditionalOnExpression("!'${resend.api-key:}'.isBlank()")
    public JavaMailSender resendMailSender(@Value("${resend.api-key}") String apiKey,
                                           @Value("${app.mail.from:}") String from) {
        return new ResendMailSender(apiKey, from);
    }
}
