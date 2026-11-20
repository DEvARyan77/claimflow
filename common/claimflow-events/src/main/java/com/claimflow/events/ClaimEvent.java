package com.claimflow.events;

import java.math.BigDecimal;

/**
 * The message sent through RabbitMQ every time a claim changes status.
 * Claims service publishes it; Payment and Notification services consume it.
 * Keeping it in one shared module guarantees sender and receivers agree on the fields.
 */
public record ClaimEvent(
        Long claimId,
        Long patientId,
        Long providerId,
        BigDecimal amount,
        String status,
        String reason,
        String extraEmail      // optional second address that also gets the claim updates (e.g. a family member)
) {
}
