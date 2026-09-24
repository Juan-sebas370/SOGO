package com.sogo.config;

import com.sogo.security.OAuth2SuccessHandler;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    // Our REST controllers do their own JWT check per endpoint (see AuthController / ProtectedController),
    // so this chain only needs to wire up the OAuth2 login redirect flow (/oauth2/authorization/*)
    // and otherwise stay out of the way.
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, OAuth2SuccessHandler oAuth2SuccessHandler,
                                                     ObjectProvider<ClientRegistrationRepository> clientRegistrations) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());

        // Only enable social login once at least one provider (Google/Azure) has real credentials
        // configured (see OAuth2ClientConfig) - otherwise there's no ClientRegistrationRepository bean.
        if (clientRegistrations.getIfAvailable() != null) {
            http.oauth2Login(oauth2 -> oauth2.successHandler(oAuth2SuccessHandler));
        }
        return http.build();
    }
}
