package com.claimflow.notification.service;

import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Sends emails through Brevo's HTTP API (works on Render, which blocks SMTP ports),
 * or over SMTP when only MAIL_USERNAME/MAIL_PASSWORD are set. Off when neither is set.
 */
@Slf4j
@Component
public class EmailSender {

    /** One email: who it's for, what it says, and the button at the bottom. */
    public record Mail(String to, String name, String subject, String headline, String message,
                       String tone, String buttonLabel, String link) {
    }

    /** Demo accounts use these domains: they don't exist, so nothing is sent to them. */
    private static final List<String> DEMO_DOMAINS = List.of("@example.com", "@claimflow.dev");

    private final ObjectProvider<JavaMailSender> mailSender;
    private final String smtpUser;
    private final String brevoKey;
    private final String from;
    private final String fromName;
    private final String overrideTo;
    private final String appUrl;
    private final RestClient brevo;

    public EmailSender(ObjectProvider<JavaMailSender> mailSender,
                       @Value("${spring.mail.username:}") String smtpUser,
                       @Value("${claimflow.email.brevo-api-key:}") String brevoKey,
                       @Value("${claimflow.email.from:}") String from,
                       @Value("${claimflow.email.from-name:ClaimFlow}") String fromName,
                       @Value("${claimflow.email.override-to:}") String overrideTo,
                       @Value("${claimflow.email.app-url:http://localhost:3000}") String appUrl) {
        this.mailSender = mailSender;
        this.smtpUser = trim(smtpUser);
        this.brevoKey = trim(brevoKey);
        this.from = trim(from).isEmpty() ? this.smtpUser : trim(from);
        this.fromName = fromName;
        this.overrideTo = trim(overrideTo);
        this.appUrl = appUrl.replaceAll("/+$", "");
        SimpleClientHttpRequestFactory timeouts = new SimpleClientHttpRequestFactory();
        timeouts.setConnectTimeout(Duration.ofSeconds(10));
        timeouts.setReadTimeout(Duration.ofSeconds(15));
        this.brevo = RestClient.builder().baseUrl("https://api.brevo.com/v3").requestFactory(timeouts).build();
        log.info("Email: {}", useBrevo() ? "Brevo API (from " + this.from + ")"
                : isEnabled() ? "SMTP (from " + this.from + ")"
                : "OFF (set BREVO_API_KEY + MAIL_FROM, or MAIL_USERNAME + MAIL_PASSWORD)");
    }

    public boolean isEnabled() {
        return useBrevo() || (!smtpUser.isEmpty() && mailSender.getIfAvailable() != null);
    }

    private boolean useBrevo() {
        return !brevoKey.isEmpty() && !from.isEmpty();
    }

    public String appUrl() {
        return appUrl;
    }

    /**
     * The addresses to email, without duplicates and demo addresses.
     * With NOTIFY_EMAIL_OVERRIDE set, everything goes to that one address instead (handy for demos).
     */
    public List<String> recipients(String... addresses) {
        if (!overrideTo.isEmpty()) return List.of(overrideTo);
        return java.util.Arrays.stream(addresses)
                .filter(a -> a != null && !a.isBlank())
                .map(a -> a.trim().toLowerCase(Locale.ROOT))
                .filter(a -> DEMO_DOMAINS.stream().noneMatch(a::endsWith))
                .distinct()
                .toList();
    }

    public void send(Mail mail) throws Exception {
        String greeting = "Hi " + (mail.name() == null || mail.name().isBlank() ? "there" : mail.name().split(" ")[0]) + ",";
        String link = mail.link() == null ? appUrl : mail.link();
        String text = greeting + "\n\n" + mail.message() + "\n\n" + mail.buttonLabel() + ": " + link + "\n\nClaimFlow";
        String html = html(greeting, mail.headline(), mail.message(), mail.tone(), mail.buttonLabel(), link);
        if (useBrevo()) {
            brevo.post().uri("/smtp/email")
                    .header("api-key", brevoKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "sender", Map.of("name", fromName, "email", from),
                            "to", List.of(Map.of("email", mail.to())),
                            "subject", mail.subject(),
                            "htmlContent", html,
                            "textContent", text))
                    .retrieve()
                    .toBodilessEntity();
            return;
        }
        JavaMailSender sender = mailSender.getObject();
        MimeMessage mime = sender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(mime, true, "UTF-8");
        helper.setFrom(from, fromName);
        helper.setTo(mail.to());
        helper.setSubject(mail.subject());
        helper.setText(text, html);
        sender.send(mime);
    }

    private static String html(String greeting, String headline, String message, String tone, String button, String link) {
        String color = switch (tone == null ? "" : tone) {
            case "good" -> "#146C43";
            case "bad" -> "#A1262B";
            case "warn" -> "#9A5B00";
            default -> "#4F46E5";
        };
        return """
                <div style="font-family:Arial,Helvetica,sans-serif;background:#F6F7FB;padding:24px">
                  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #E4E6F0;border-radius:16px;padding:28px">
                    <p style="margin:0 0 18px;font-size:20px;font-weight:800;color:#4F46E5">ClaimFlow</p>
                    <p style="margin:0 0 6px;font-size:15px;color:#1B1D2A">%s</p>
                    <p style="margin:0 0 14px;font-size:22px;font-weight:800;color:%s">%s</p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#1B1D2A">%s</p>
                    <a href="%s" style="display:inline-block;background:#4F46E5;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">%s</a>
                    <p style="margin:24px 0 0;font-size:12px;color:#5C6078">This is an automated message from the ClaimFlow demo project.</p>
                  </div>
                </div>
                """.formatted(escape(greeting), color, escape(headline), escape(message), escape(link), escape(button));
    }

    private static String escape(String text) {
        return text == null ? "" : text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
