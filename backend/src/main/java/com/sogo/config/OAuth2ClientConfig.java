package com.sogo.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

import java.util.ArrayList;
import java.util.List;

@Configuration
public class OAuth2ClientConfig {

    @Value("${app.oauth2.google.client-id:}")
    private String googleClientId;
    @Value("${app.oauth2.google.client-secret:}")
    private String googleClientSecret;
    // Gated by @ConditionalOnExpression so the bean definition doesn't exist at all unless Google
    // is configured: Spring Boot's OAuth2 client autoconfiguration reacts to the mere presence of a
    // ClientRegistrationRepository bean, so returning null here (instead of skipping registration)
    // would still make it try to wire one up and fail with an NPE.
    @Bean
    @ConditionalOnExpression(
            "!'${app.oauth2.google.client-id:}'.isEmpty() && !'${app.oauth2.google.client-secret:}'.isEmpty()"
    )
    public ClientRegistrationRepository clientRegistrationRepository() {
        List<ClientRegistration> registrations = new ArrayList<>();

        if (isConfigured(googleClientId, googleClientSecret)) {
            registrations.add(CommonOAuth2Provider.GOOGLE.getBuilder("google")
                    .clientId(googleClientId)
                    .clientSecret(googleClientSecret)
                    .build());
        }

        return new InMemoryClientRegistrationRepository(registrations);
    }

    private boolean isConfigured(String clientId, String clientSecret) {
        return clientId != null && !clientId.isBlank() && clientSecret != null && !clientSecret.isBlank();
    }
}
