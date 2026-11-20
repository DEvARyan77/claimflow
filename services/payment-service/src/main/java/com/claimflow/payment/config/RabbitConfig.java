package com.claimflow.payment.config;

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
        return new TopicExchange(Messaging.EXCHANGE, true, false);   // same exchange; declaring twice is safe
    }

    @Bean
    public Queue paymentQueue() {
        return new Queue(Messaging.PAYMENT_QUEUE, true);              // durable: survives a RabbitMQ restart
    }

    @Bean
    public Binding paymentBinding(Queue paymentQueue, TopicExchange claimsExchange) {
        // only approved claims are paid
        return BindingBuilder.bind(paymentQueue).to(claimsExchange).with(Messaging.CLAIM_APPROVED);
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new JacksonJsonMessageConverter();
    }
}
