package com.claimflow.security;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Signs and checks ClaimFlow login tokens: standard JWTs (HS256, RFC 7519).
 *
 * The auth-service signs a token at login; the API gateway checks it on every request and passes the
 * user's id and role on to the services as X-User-* headers. Both use this one class, so they can't
 * disagree about the format. No library needed: HS256 is HMAC-SHA256 over base64url(header).base64url(payload).
 *
 * The payload is a flat JSON object of strings and numbers (that's all ClaimFlow needs), handled by
 * {@link FlatJson}.
 */
public final class JwtCodec {

    private static final String HEADER = b64("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
    private static final Base64.Decoder B64_DECODER = Base64.getUrlDecoder();

    private final byte[] secret;
    private final Clock clock;

    public JwtCodec(String secret) {
        this(secret, Clock.systemUTC());
    }

    public JwtCodec(String secret, Clock clock) {
        if (secret == null || secret.length() < 32) {
            throw new IllegalArgumentException("JWT secret must be at least 32 characters");
        }
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.clock = clock;
    }

    /** The user facts carried in a token. patientId / providerId are null unless the role needs them. */
    public record UserClaims(String userId, String role, String name, String email, String patientId, String providerId) {
    }

    public String sign(UserClaims user, Duration ttl) {
        long now = clock.instant().getEpochSecond();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sub", user.userId());
        payload.put("role", user.role());
        payload.put("name", user.name());
        payload.put("email", user.email());
        if (user.patientId() != null) payload.put("pid", user.patientId());
        if (user.providerId() != null) payload.put("hid", user.providerId());
        payload.put("iat", now);
        payload.put("exp", now + ttl.toSeconds());
        String body = HEADER + "." + b64(FlatJson.write(payload).getBytes(StandardCharsets.UTF_8));
        return body + "." + b64(hmac(body));
    }

    /** The user, or empty if the token is malformed, tampered with, or expired. Never throws. */
    public Optional<UserClaims> verify(String token) {
        try {
            if (token == null) return Optional.empty();
            String[] parts = token.split("\\.");
            if (parts.length != 3 || !HEADER.equals(parts[0])) return Optional.empty();
            byte[] expected = hmac(parts[0] + "." + parts[1]);
            // constant-time comparison, so response timing can't leak the signature
            if (!MessageDigest.isEqual(expected, B64_DECODER.decode(parts[2]))) return Optional.empty();

            Map<String, Object> p = FlatJson.read(new String(B64_DECODER.decode(parts[1]), StandardCharsets.UTF_8));
            Object exp = p.get("exp");
            if (!(exp instanceof Number n) || n.longValue() <= clock.instant().getEpochSecond()) return Optional.empty();
            String sub = str(p.get("sub"));
            String role = str(p.get("role"));
            if (sub == null || role == null) return Optional.empty();
            return Optional.of(new UserClaims(sub, role, str(p.get("name")), str(p.get("email")),
                    str(p.get("pid")), str(p.get("hid"))));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private byte[] hmac(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    private static String b64(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
