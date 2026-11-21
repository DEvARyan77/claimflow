package com.claimflow.auth.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;

/**
 * Checks a Google ID token from "Sign in with Google" using Google's tokeninfo endpoint
 * (Google verifies the signature), then that it was issued for our app and the email is verified.
 */
@Component
public class GoogleVerifier {

    public record GoogleProfile(String subject, String email, String name) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TokenInfo(String aud, String iss, String sub, String email, String email_verified, String name, String exp) {
    }

    private static final Set<String> ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");

    private final String clientId;
    private final RestClient http;

    public GoogleVerifier(@Value("${claimflow.auth.google-client-id:}") String clientId) {
        this.clientId = clientId == null ? "" : clientId.trim();
        SimpleClientHttpRequestFactory timeouts = new SimpleClientHttpRequestFactory();
        timeouts.setConnectTimeout(Duration.ofSeconds(5));
        timeouts.setReadTimeout(Duration.ofSeconds(10));
        this.http = RestClient.builder().baseUrl("https://oauth2.googleapis.com").requestFactory(timeouts).build();
    }

    public boolean isEnabled() {
        return !clientId.isEmpty();
    }

    public String clientId() {
        return clientId;
    }

    public GoogleProfile verify(String credential) {
        if (!isEnabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Google sign-in isn't set up on this server");
        TokenInfo info;
        try {
            info = http.get().uri(b -> b.path("/tokeninfo").queryParam("id_token", credential).build())
                    .retrieve().body(TokenInfo.class);
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google sign-in failed. Please try again.");
        }
        if (info == null || !clientId.equals(info.aud()) || !ISSUERS.contains(info.iss())
                || info.exp() == null || Long.parseLong(info.exp()) < Instant.now().getEpochSecond()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google sign-in failed. Please try again.");
        }
        if (info.email() == null || !"true".equals(info.email_verified())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your Google account has no verified email");
        }
        String name = info.name() != null && !info.name().isBlank() ? info.name() : info.email().split("@")[0];
        return new GoogleProfile(info.sub(), info.email().toLowerCase(), name);
    }
}
