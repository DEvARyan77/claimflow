package com.claimflow.security;

import com.claimflow.security.JwtCodec.UserClaims;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtCodecTest {

    private static final String SECRET = "a-test-secret-that-is-at-least-32-chars!";
    private final UserClaims rahul = new UserClaims("u1", Roles.POLICYHOLDER, "Rahul \"R\" Sharma", "rahul@x.dev", "p1", null);

    @Test
    void roundTrip() {
        JwtCodec codec = new JwtCodec(SECRET);
        String token = codec.sign(rahul, Duration.ofHours(1));
        assertThat(token.split("\\.")).hasSize(3);
        assertThat(codec.verify(token)).contains(rahul);
    }

    @Test
    void isAStandardJwt() {
        String token = new JwtCodec(SECRET).sign(rahul, Duration.ofHours(1));
        String header = new String(Base64.getUrlDecoder().decode(token.split("\\.")[0]));
        assertThat(header).isEqualTo("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        Map<String, Object> payload = FlatJson.read(new String(Base64.getUrlDecoder().decode(token.split("\\.")[1])));
        assertThat(payload).containsEntry("sub", "u1").containsEntry("role", "POLICYHOLDER").containsKeys("iat", "exp");
        assertThat(payload).doesNotContainKey("hid");
    }

    @Test
    void rejectsTamperedPayload() {
        JwtCodec codec = new JwtCodec(SECRET);
        String[] parts = codec.sign(rahul, Duration.ofHours(1)).split("\\.");
        String admin = Base64.getUrlEncoder().withoutPadding().encodeToString(
                ("{\"sub\":\"u1\",\"role\":\"ADMIN\",\"exp\":" + (Instant.now().getEpochSecond() + 3600) + "}").getBytes());
        assertThat(codec.verify(parts[0] + "." + admin + "." + parts[2])).isEmpty();
    }

    @Test
    void rejectsTokenSignedWithAnotherSecret() {
        String token = new JwtCodec("another-secret-that-is-also-32-chars-long").sign(rahul, Duration.ofHours(1));
        assertThat(new JwtCodec(SECRET).verify(token)).isEmpty();
    }

    @Test
    void rejectsExpiredToken() {
        Clock past = Clock.fixed(Instant.now().minus(Duration.ofHours(2)), ZoneOffset.UTC);
        String token = new JwtCodec(SECRET, past).sign(rahul, Duration.ofHours(1));
        assertThat(new JwtCodec(SECRET).verify(token)).isEmpty();
    }

    @Test
    void rejectsGarbageAndAlgNone() {
        JwtCodec codec = new JwtCodec(SECRET);
        assertThat(codec.verify(null)).isEmpty();
        assertThat(codec.verify("")).isEmpty();
        assertThat(codec.verify("a.b.c")).isEmpty();
        String none = Base64.getUrlEncoder().withoutPadding().encodeToString("{\"alg\":\"none\"}".getBytes());
        String[] parts = codec.sign(rahul, Duration.ofHours(1)).split("\\.");
        assertThat(codec.verify(none + "." + parts[1] + ".")).isEmpty();
    }

    @Test
    void refusesShortSecret() {
        assertThatThrownBy(() -> new JwtCodec("short")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void flatJsonHandlesEscapes() {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("a", "quote \" slash \\ newline \n tab \t é ₹");
        m.put("n", 42L);
        m.put("b", true);
        m.put("z", null);
        assertThat(FlatJson.read(FlatJson.write(m))).isEqualTo(m);
        assertThat(FlatJson.read(" { \"x\" : \"\\u0041\" } ")).containsEntry("x", "A");
    }
}
