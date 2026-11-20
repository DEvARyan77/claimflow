package com.claimflow.notification.service;

import com.claimflow.events.AccountEvent;
import com.claimflow.events.Messaging;
import com.claimflow.notification.service.EmailSender.Mail;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

/**
 * Account emails from auth-service: welcome, staff account created, password reset link, password changed.
 * Each goes to the login email and a copy to the alternate email.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AccountEmailListener {

    private final EmailSender emailSender;

    @RabbitListener(queues = Messaging.ACCOUNT_NOTIFICATION_QUEUE)
    public void onAccountEvent(AccountEvent event) {
        if (!emailSender.isEnabled()) {
            log.info("Account email {} for {} not sent (email is off)", event.type(), event.email());
            return;
        }
        Mail template = mailFor(event);
        if (template == null) return;
        for (String to : emailSender.recipients(event.email(), event.alternateEmail())) {
            try {
                emailSender.send(new Mail(to, event.name(), template.subject(), template.headline(), template.message(),
                        template.tone(), template.buttonLabel(), template.link()));
                log.info("Sent {} email to {}", event.type(), to);
            } catch (Exception e) {
                log.warn("{} email to {} failed: {}", event.type(), to, e.getMessage());
            }
        }
    }

    static Mail mailFor(AccountEvent e) {
        return switch (e.type()) {
            case "WELCOME" -> new Mail(null, e.name(), "Welcome to ClaimFlow", "Your account is ready",
                    "You can now file claims, track every update and see your remaining cover in one place.",
                    "good", "Open ClaimFlow", e.link());
            case "STAFF_CREATED" -> new Mail(null, e.name(), "Your ClaimFlow " + roleName(e.role()) + " account",
                    "Welcome to the team",
                    "An administrator created a " + roleName(e.role()) + " account for " + e.email()
                            + ". Use the password they gave you, or choose Forgot password to set your own.",
                    "info", "Sign in", e.link());
            case "PASSWORD_RESET" -> new Mail(null, e.name(), "Reset your ClaimFlow password", "Reset your password",
                    "Someone asked to reset your password. The link works once and expires in 30 minutes. "
                            + "If it wasn't you, ignore this email: your password stays the same.",
                    "warn", "Choose a new password", e.link());
            case "PASSWORD_CHANGED" -> new Mail(null, e.name(), "Your ClaimFlow password was changed", "Password changed",
                    "Your password was just changed. If this wasn't you, reset it right away from the sign-in page.",
                    "warn", "Sign in", e.link());
            default -> null;
        };
    }

    private static String roleName(String role) {
        return switch (role == null ? "" : role) {
            case "HOSPITAL" -> "hospital";
            case "OFFICER" -> "claims officer";
            case "ADMIN" -> "admin";
            default -> "ClaimFlow";
        };
    }
}
