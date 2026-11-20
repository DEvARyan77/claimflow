package com.claimflow.notification.service;

import com.claimflow.events.ClaimEvent;
import com.claimflow.events.Messaging;
import com.claimflow.notification.client.PatientClient;
import com.claimflow.notification.client.PatientClient.PatientContact;
import com.claimflow.notification.entity.Notification;
import com.claimflow.notification.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Runs automatically for every message in notification.queue:
 * saves the message (shown in the app) and, when email is set up, emails the patient.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationListener {

    private final NotificationRepository notificationRepository;
    private final EmailSender emailSender;
    private final PatientClient patientClient;

    @RabbitListener(queues = Messaging.NOTIFICATION_QUEUE)
    public void onClaimEvent(ClaimEvent event) {
        String message = buildMessage(event);

        Notification notification = new Notification();
        notification.setPatientId(event.patientId());
        notification.setClaimId(event.claimId());
        notification.setClaimNumber(event.claimNumber());
        notification.setSentAt(LocalDateTime.now());
        notification.setClaimStatus(event.status());
        notification.setMessage(message);
        notification.setChannel("IN_APP");
        notification.setDeliveryStatus("NOT_SENT");

        if (emailSender.isEnabled()) {
            sendEmail(event, message, notification);
        }
        notificationRepository.save(notification);
        log.info("Notified patient {} ({} {}): {}", event.patientId(), notification.getChannel(),
                notification.getDeliveryStatus(), message);
    }

    /** An email problem must never lose the in-app message, so every failure is caught here. */
    private void sendEmail(ClaimEvent event, String message, Notification notification) {
        PatientContact patient = null;
        try {
            patient = patientClient.getPatient(event.patientId());
        } catch (Exception e) {
            log.warn("Couldn't look up patient {}: {}", event.patientId(), e.getMessage());
        }
        String to = emailSender.recipientFor(patient == null ? null : patient.email());
        String extra = emailSender.extraRecipient(event.extraEmail(), to);
        String name = patient == null ? null : patient.name();

        List<String> sentTo = new ArrayList<>();
        boolean failed = false;
        for (String address : Arrays.asList(to, extra)) {
            if (address == null) continue;
            try {
                emailSender.send(address, name, subject(event), headline(event), message, event.status());
                sentTo.add(address);
            } catch (Exception e) {
                log.warn("Email to {} failed: {}", address, e.getMessage());
                failed = true;
            }
        }
        if (sentTo.isEmpty() && !failed) {
            notification.setDeliveryStatus("SKIPPED_NO_EMAIL");
            return;
        }
        notification.setRecipient(String.join(", ", sentTo));
        if (!sentTo.isEmpty()) notification.setChannel("EMAIL");
        notification.setDeliveryStatus(failed ? "FAILED" : "SENT");
    }

    static String buildMessage(ClaimEvent event) {
        String claim = "claim " + number(event);
        String amount = "₹" + format(event.amount());
        return switch (event.status()) {
            case "SUBMITTED" -> "We received your " + claim + " of " + amount + ". Verification will finish shortly.";
            case "APPROVED" -> "Good news! Your " + claim + " of " + amount + " is approved. We're paying the hospital now.";
            case "REJECTED" -> "Your " + claim + " of " + amount + " was not approved. Reason: " + event.reason() + ".";
            case "PAID" -> amount + " for " + claim + " has been paid to the hospital. Nothing more to do.";
            default -> "Update on your " + claim + ": " + event.status();
        };
    }

    private static String subject(ClaimEvent event) {
        return switch (event.status()) {
            case "SUBMITTED" -> "We received your claim " + number(event);
            case "APPROVED" -> "Claim " + number(event) + " approved";
            case "REJECTED" -> "Claim " + number(event) + " was not approved";
            case "PAID" -> "Claim " + number(event) + " paid to the hospital";
            default -> "Update on claim " + number(event);
        } + " · ClaimFlow";
    }

    private static String headline(ClaimEvent event) {
        return switch (event.status()) {
            case "SUBMITTED" -> "Claim received";
            case "APPROVED" -> "Claim approved";
            case "REJECTED" -> "Claim not approved";
            case "PAID" -> "Hospital paid";
            default -> "Claim update";
        };
    }

    /** The readable claim number; falls back to the id for events sent before claim numbers existed. */
    static String number(ClaimEvent event) {
        return event.claimNumber() != null ? event.claimNumber() : "#" + event.claimId();
    }

    private static String format(BigDecimal value) {
        if (value == null) {
            return "0";
        }
        NumberFormat format = NumberFormat.getNumberInstance(Locale.of("en", "IN"));
        format.setMaximumFractionDigits(2);
        return format.format(value);
    }
}
