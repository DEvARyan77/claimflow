package com.claimflow.notification.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * Sends the claim update as a real email over SMTP (e.g. Gmail with an app password).
 * Turned off automatically when MAIL_USERNAME isn't set.
 */
@Slf4j
@Component
public class EmailSender {

    private final ObjectProvider<JavaMailSender> mailSender;
    private final String username;
    private final String from;
    private final String overrideTo;
    private final String appUrl;

    public EmailSender(ObjectProvider<JavaMailSender> mailSender,
                       @Value("${spring.mail.username:}") String username,
                       @Value("${claimflow.email.from:}") String from,
                       @Value("${claimflow.email.override-to:}") String overrideTo,
                       @Value("${claimflow.email.app-url:http://localhost:3000}") String appUrl) {
        this.mailSender = mailSender;
        this.username = username == null ? "" : username.trim();
        this.from = from == null || from.isBlank() ? this.username : from.trim();
        this.overrideTo = overrideTo == null ? "" : overrideTo.trim();
        this.appUrl = appUrl;
        log.info("Email notifications: {}", isEnabled()
                ? "ON (from " + this.from + (this.overrideTo.isEmpty() ? "" : ", all emails go to " + this.overrideTo) + ")"
                : "OFF (set MAIL_USERNAME and MAIL_PASSWORD to turn on)");
    }

    public boolean isEnabled() {
        return !username.isEmpty() && mailSender.getIfAvailable() != null;
    }

    /**
     * Where to send: the override address (handy for demos), otherwise the patient's own email.
     * Demo addresses (@example.com) don't exist, so they return null and are skipped.
     */
    public String recipientFor(String patientEmail) {
        if (!overrideTo.isEmpty()) return overrideTo;
        if (patientEmail == null || patientEmail.isBlank()) return null;
        if (patientEmail.toLowerCase(Locale.ROOT).endsWith("@example.com")) return null;
        return patientEmail.trim();
    }

    /** The extra address typed on the claim form (always real, so never skipped). */
    public String extraRecipient(String extraEmail, String mainRecipient) {
        if (extraEmail == null || extraEmail.isBlank()) return null;
        String extra = extraEmail.trim();
        return extra.equalsIgnoreCase(mainRecipient) ? null : extra;
    }

    public void send(String to, String patientName, String subject, String headline, String message, String status)
            throws MessagingException {
        JavaMailSender sender = mailSender.getObject();
        MimeMessage mime = sender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(mime, true, "UTF-8");
        helper.setFrom(from);
        helper.setTo(to);
        helper.setSubject(subject);
        String greeting = "Hi " + (patientName == null || patientName.isBlank() ? "there" : patientName.split(" ")[0]) + ",";
        String plain = greeting + "\n\n" + message + "\n\nTrack your claim: " + appUrl + "\n\nClaimFlow";
        helper.setText(plain, html(greeting, headline, message, status));
        sender.send(mime);
    }

    private String html(String greeting, String headline, String message, String status) {
        String color = switch (status) {
            case "APPROVED", "PAID" -> "#146C43";
            case "REJECTED" -> "#A1262B";
            default -> "#4F46E5";
        };
        return """
                <div style="font-family:Arial,Helvetica,sans-serif;background:#F6F7FB;padding:24px">
                  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #E4E6F0;border-radius:16px;padding:28px">
                    <p style="margin:0 0 18px;font-size:20px;font-weight:800;color:#4F46E5">ClaimFlow</p>
                    <p style="margin:0 0 6px;font-size:15px;color:#1B1D2A">%s</p>
                    <p style="margin:0 0 14px;font-size:22px;font-weight:800;color:%s">%s</p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#1B1D2A">%s</p>
                    <a href="%s" style="display:inline-block;background:#4F46E5;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">Track your claim</a>
                    <p style="margin:24px 0 0;font-size:12px;color:#5C6078">This is an automated message from the ClaimFlow demo project.</p>
                  </div>
                </div>
                """.formatted(escape(greeting), color, escape(headline), escape(message), escape(appUrl));
    }

    private static String escape(String text) {
        return text == null ? "" : text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
