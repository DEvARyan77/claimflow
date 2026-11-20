package com.claimflow.auth.config;

import com.claimflow.events.Messaging;
import com.claimflow.security.JwtCodec;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class AuthConfig {

    /** Same secret as the gateway (claimflow.auth.jwt-secret in the shared config). */
    @Bean
    public JwtCodec jwtCodec(@Value("${claimflow.auth.jwt-secret}") String secret) {
        return new JwtCodec(secret);
    }

    /** BCrypt with cost 10: slow on purpose, so stolen hashes are expensive to guess. */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    @Bean
    public TopicExchange accountExchange() {
        return new TopicExchange(Messaging.ACCOUNT_EXCHANGE, true, false);
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new JacksonJsonMessageConverter();
    }
}
