package com.claimflow.notification.service;

import com.claimflow.events.ClaimEvent;
import com.claimflow.events.Messaging;
import com.claimflow.notification.client.AuthClient;
import com.claimflow.notification.client.PatientClient;
import com.claimflow.notification.client.PatientClient.PatientContact;
import com.claimflow.notification.entity.Notification;
import com.claimflow.notification.repository.NotificationRepository;
import com.claimflow.notification.service.EmailSender.Mail;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Runs automatically for every message in notification.queue:
 * saves the message (shown in the app) and, when email is set up, emails the policyholder
 * (their login email + alternate email, plus the extra address typed on the claim).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationListener {

    private final NotificationRepository notificationRepository;
    private final EmailSender emailSender;
    private final PatientClient patientClient;
    private final AuthClient authClient;

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
        String email = null, alternate = null, name = null;
        try {
            AuthClient.Account account = authClient.accountForPatient(event.patientId());
            email = account.email();
            alternate = account.alternateEmail();
            name = account.name();
        } catch (Exception e) {
            // no login account yet (or auth is down): use the email on the policy
            try {
                PatientContact patient = patientClient.getPatient(event.patientId());
                email = patient.email();
                name = patient.name();
            } catch (Exception e2) {
                log.warn("Couldn't look up patient {}: {}", event.patientId(), e2.getMessage());
            }
        }

        List<String> sentTo = new ArrayList<>();
        boolean failed = false;
        for (String address : emailSender.recipients(email, alternate, event.extraEmail())) {
            try {
                emailSender.send(new Mail(address, name, subject(event), headline(event), message, tone(event.status()),
                        "Track your claim", emailSender.appUrl() + "/claims/" + event.claimId()));
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
        String amount = inr(event.amount());
        return switch (event.status()) {
            case "SUBMITTED" -> "We received your " + claim + " of " + amount + ". Verification will finish shortly.";
            case "UNDER_REVIEW" -> "Your " + claim + " of " + amount + " is with our claims team for a quick review. "
                    + "We'll let you know as soon as it's decided.";
            case "INFO_REQUESTED" -> "We need a little more information for your " + claim + ". "
                    + strip(event.reason(), "More information needed: ") + " Please reply from the claim page.";
            case "APPROVED" -> "Good news! Your " + claim + " of " + amount + " is approved. We're paying the hospital now.";
            case "REJECTED" -> "Your " + claim + " of " + amount + " was not approved. Reason: " + event.reason() + ".";
            case "PAID" -> amount + " for " + claim + " has been paid to the hospital. Nothing more to do.";
            default -> "Update on your " + claim + ": " + event.status();
        };
    }

    private static String subject(ClaimEvent event) {
        return switch (event.status()) {
            case "SUBMITTED" -> "We received your claim " + number(event);
            case "UNDER_REVIEW" -> "Claim " + number(event) + " is being reviewed";
            case "INFO_REQUESTED" -> "Action needed: claim " + number(event);
            case "APPROVED" -> "Claim " + number(event) + " approved";
            case "REJECTED" -> "Claim " + number(event) + " was not approved";
            case "PAID" -> "Claim " + number(event) + " paid to the hospital";
            default -> "Update on claim " + number(event);
        } + " · ClaimFlow";
    }

    private static String headline(ClaimEvent event) {
        return switch (event.status()) {
            case "SUBMITTED" -> "Claim received";
            case "UNDER_REVIEW" -> "Claim under review";
            case "INFO_REQUESTED" -> "More information needed";
            case "APPROVED" -> "Claim approved";
            case "REJECTED" -> "Claim not approved";
            case "PAID" -> "Hospital paid";
            default -> "Claim update";
        };
    }

    private static String tone(String status) {
        return switch (status) {
            case "APPROVED", "PAID" -> "good";
            case "REJECTED" -> "bad";
            case "INFO_REQUESTED" -> "warn";
            default -> "info";
        };
    }

    /** The readable claim number; falls back to the id for events sent before claim numbers existed. */
    static String number(ClaimEvent event) {
        return event.claimNumber() != null ? event.claimNumber() : "#" + event.claimId();
    }

    private static String strip(String text, String prefix) {
        if (text == null) return "";
        String t = text.startsWith(prefix) ? text.substring(prefix.length()) : text;
        return t.endsWith(".") ? t : t + ".";
    }

    /** ₹ with Indian digit grouping: 450000 → ₹4,50,000 */
    static String inr(BigDecimal value) {
        if (value == null) return "₹0";
        String digits = value.setScale(0, RoundingMode.HALF_UP).toBigInteger().toString();
        if (digits.length() <= 3) return "₹" + digits;
        String last3 = digits.substring(digits.length() - 3);
        String rest = digits.substring(0, digits.length() - 3);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < rest.length(); i++) {
            if (i > 0 && (rest.length() - i) % 2 == 0) sb.append(',');
            sb.append(rest.charAt(i));
        }
        return "₹" + sb + "," + last3;
    }
}
