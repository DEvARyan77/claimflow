package com.claimflow.claims.service;

import com.claimflow.claims.entity.Claim;
import com.claimflow.events.ClaimEvent;
import com.claimflow.events.Messaging;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

/** Announces every claim status change on RabbitMQ. Claims never waits for the listeners. */
@Slf4j
@Component
@RequiredArgsConstructor
public class ClaimEventPublisher {

    private final RabbitTemplate rabbitTemplate;

    public void publish(Claim claim) {
        ClaimEvent event = new ClaimEvent(
                claim.getId(),
                claim.getClaimNumber(),
                claim.getPatientId(),
                claim.getProviderId(),
                claim.getAmount(),
                claim.getStatus().name(),
                claim.getReason(),
                claim.getExtraEmail());
        String routingKey = Messaging.routingKeyFor(claim.getStatus().name());
        try {
            rabbitTemplate.convertAndSend(Messaging.EXCHANGE, routingKey, event);
            log.info("Published {} for claim {}", routingKey, claim.getClaimNumber());
        } catch (AmqpException e) {
            // RabbitMQ being down must not fail the claim itself
            log.error("Could not publish {} for claim {}: {}", routingKey, claim.getId(), e.getMessage());
        }
    }
}
