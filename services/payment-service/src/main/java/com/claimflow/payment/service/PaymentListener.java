package com.claimflow.payment.service;

import com.claimflow.events.ClaimEvent;
import com.claimflow.events.Messaging;
import com.claimflow.payment.client.ClaimsClient;
import com.claimflow.payment.entity.Payment;
import com.claimflow.payment.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Runs automatically for every message in payment.queue (approved claims only).
 * Idempotent: if the same claim arrives twice, it is paid once and only marked PAID again.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentListener {

    private final PaymentRepository paymentRepository;
    private final ClaimsClient claimsClient;

    @Value("${claimflow.payment.processing-delay-ms:4000}")
    private long processingDelayMs;

    @RabbitListener(queues = Messaging.PAYMENT_QUEUE)
    public void onClaimApproved(ClaimEvent event) {
        if (!"APPROVED".equals(event.status())) {
            return;
        }

        Payment payment = paymentRepository.findByClaimId(event.claimId())
                .orElseGet(() -> pay(event));
        if (payment == null) {
            return;                       // another delivery of this message is paying it right now
        }

        // If this call fails, the listener retries the message (see payment-service.yml)
        claimsClient.markPaid(event.claimId(), new ClaimsClient.MarkPaidRequest(payment.getReference()));
        log.info("Paid ₹{} to provider {} for claim {} ({})",
                payment.getAmount(), payment.getProviderId(), payment.getClaimNumber(), payment.getReference());
    }

    private Payment pay(ClaimEvent event) {
        simulateBankTransfer();
        Payment payment = new Payment();
        payment.setClaimId(event.claimId());
        payment.setClaimNumber(event.claimNumber());
        payment.setPatientId(event.patientId());
        payment.setProviderId(event.providerId());
        payment.setAmount(event.amount());
        payment.setReference("PAY-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        payment.setPaidAt(LocalDateTime.now());
        try {
            return paymentRepository.save(payment);
        } catch (DuplicateKeyException e) {
            // The unique index on claimId stopped a second payment for the same claim.
            log.warn("Claim {} is already paid; skipping duplicate payment", event.claimNumber());
            return paymentRepository.findByClaimId(event.claimId()).orElse(null);
        }
    }

    private void simulateBankTransfer() {
        try {
            Thread.sleep(processingDelayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
