package com.claimflow.auth.service;

import com.claimflow.auth.entity.User;
import com.claimflow.events.AccountEvent;
import com.claimflow.events.Messaging;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.util.Locale;

/** Tells notification-service to send an account email. Never fails the request if RabbitMQ is down. */
@Slf4j
@Component
@RequiredArgsConstructor
public class AccountEventPublisher {

    private final RabbitTemplate rabbitTemplate;

    public void publish(String type, User user, String link) {
        AccountEvent event = new AccountEvent(type, user.getEmail(), user.getAlternateEmail(), user.getName(), user.getRole(), link);
        try {
            rabbitTemplate.convertAndSend(Messaging.ACCOUNT_EXCHANGE, "account." + type.toLowerCase(Locale.ROOT), event);
        } catch (AmqpException e) {
            log.error("Couldn't publish account.{} for {}: {}", type.toLowerCase(Locale.ROOT), user.getEmail(), e.getMessage());
        }
    }
}
