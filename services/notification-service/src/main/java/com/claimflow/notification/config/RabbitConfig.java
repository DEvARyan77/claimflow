package com.claimflow.notification.config;

import com.claimflow.events.Messaging;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitConfig {

    @Bean
    public TopicExchange claimsExchange() {
        return new TopicExchange(Messaging.EXCHANGE, true, false);
    }

    @Bean
    public Queue notificationQueue() {
        return new Queue(Messaging.NOTIFICATION_QUEUE, true);
    }

    @Bean
    public Binding notificationBinding(Queue notificationQueue, TopicExchange claimsExchange) {
        // "claim.*" = every status change: submitted, approved, rejected, paid
        return BindingBuilder.bind(notificationQueue).to(claimsExchange).with(Messaging.ALL_CLAIM_EVENTS);
    }

    @Bean
    public TopicExchange accountExchange() {
        return new TopicExchange(Messaging.ACCOUNT_EXCHANGE, true, false);
    }

    @Bean
    public Queue accountNotificationQueue() {
        return new Queue(Messaging.ACCOUNT_NOTIFICATION_QUEUE, true);
    }

    @Bean
    public Binding accountBinding(Queue accountNotificationQueue, TopicExchange accountExchange) {
        // "account.*" = welcome, staff account created, password reset / changed
        return BindingBuilder.bind(accountNotificationQueue).to(accountExchange).with(Messaging.ALL_ACCOUNT_EVENTS);
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new JacksonJsonMessageConverter();
    }
}
