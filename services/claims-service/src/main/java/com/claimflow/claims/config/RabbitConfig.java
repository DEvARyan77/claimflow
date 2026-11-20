package com.claimflow.claims.config;

import com.claimflow.events.Messaging;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Claims only declares the exchange (the post office). Each listening service declares its own queue
 * (mailbox) and binding, so Claims doesn't need to know who is listening.
 */
@Configuration
public class RabbitConfig {

    @Bean
    public TopicExchange claimsExchange() {
        return new TopicExchange(Messaging.EXCHANGE, true, false);
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new JacksonJsonMessageConverter();
    }
}
