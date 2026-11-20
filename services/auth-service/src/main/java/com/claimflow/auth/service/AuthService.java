package com.claimflow.auth.service;

import com.claimflow.auth.client.Clients.EnrolRequest;
import com.claimflow.auth.client.Clients.PatientClient;
import com.claimflow.auth.client.Clients.PatientRef;
import com.claimflow.auth.client.Clients.ProviderClient;
import com.claimflow.auth.dto.AuthDtos.*;
import com.claimflow.auth.entity.User;
import com.claimflow.auth.repository.UserRepository;
import com.claimflow.security.JwtCodec;
import com.claimflow.security.Roles;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final Duration RESET_TTL = Duration.ofMinutes(30);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtCodec jwt;
    private final PatientClient patientClient;
    private final ProviderClient providerClient;
    private final AccountEventPublisher events;

    @Value("${claimflow.auth.token-hours:12}")
    private long tokenHours;

    @Value("${claimflow.auth.app-url:http://localhost:3000}")
    private String appUrl;

    // ---------- sign-up and sign-in ----------

    public LoginResponse register(RegisterRequest req) {
        String email = normalize(req.email());
        if (users.existsByEmail(email)) {
            throw error(HttpStatus.CONFLICT, "An account with this email already exists. Try signing in.");
        }
        PatientRef patient = linkOrEnrolPolicy(req, email);
        if (users.existsByPatientId(patient.id())) {
            throw error(HttpStatus.CONFLICT, "Policy " + patient.policyNumber() + " already has an account.");
        }

        User user = new User();
        user.setEmail(email);
        user.setAlternateEmail(alternate(req.alternateEmail(), email));
        user.setName(req.name().trim());
        user.setRole(Roles.POLICYHOLDER);
        user.setPatientId(patient.id());
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setCreatedAt(Instant.now());
        user = save(user);

        events.publish("WELCOME", user, appUrl + "/");
        log.info("New policyholder {} linked to policy {}", user.getEmail(), patient.policyNumber());
        return loginResponse(user);
    }

    /** With a policy number: that policy, if the email matches. Without: a new demo policy. */
    private PatientRef linkOrEnrolPolicy(RegisterRequest req, String email) {
        try {
            if (req.policyNumber() == null || req.policyNumber().isBlank()) {
                return patientClient.enrol(new EnrolRequest(req.name().trim(), email, req.phone()));
            }
            PatientRef patient = patientClient.byPolicy(req.policyNumber().trim());
            if (patient.email() == null || !patient.email().equalsIgnoreCase(email)) {
                throw error(HttpStatus.BAD_REQUEST,
                        "Use the email address on policy " + patient.policyNumber() + " to sign up for it.");
            }
            return patient;
        } catch (FeignException.NotFound e) {
            throw error(HttpStatus.BAD_REQUEST, "We couldn't find policy " + req.policyNumber().trim() + ".");
        } catch (FeignException e) {
            throw error(HttpStatus.SERVICE_UNAVAILABLE, "The policy service is busy. Please try again in a minute.");
        }
    }

    public LoginResponse login(LoginRequest req) {
        User user = users.findByEmail(normalize(req.email()))
                .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElseThrow(() -> error(HttpStatus.UNAUTHORIZED, "Wrong email or password"));
        if (!user.isActive()) {
            throw error(HttpStatus.FORBIDDEN, "This account has been switched off. Please contact the admin.");
        }
        user.setLastLoginAt(Instant.now());
        users.save(user);
        return loginResponse(user);
    }

    private LoginResponse loginResponse(User user) {
        String token = jwt.sign(new JwtCodec.UserClaims(user.getId(), user.getRole(), user.getName(), user.getEmail(),
                user.getPatientId(), user.getProviderId()), Duration.ofHours(tokenHours));
        return new LoginResponse(token, UserView.of(user));
    }

    // ---------- own account ----------

    public User me(String userId) {
        if (userId == null) throw error(HttpStatus.UNAUTHORIZED, "Please sign in");
        return users.findById(userId).filter(User::isActive)
                .orElseThrow(() -> error(HttpStatus.UNAUTHORIZED, "Please sign in again"));
    }

    public User updateMe(String userId, UpdateMeRequest req) {
        User user = me(userId);
        if (req.name() != null && !req.name().isBlank()) user.setName(req.name().trim());
        if (req.alternateEmail() != null) user.setAlternateEmail(alternate(req.alternateEmail(), user.getEmail()));
        return users.save(user);
    }

    public void changePassword(String userId, ChangePasswordRequest req) {
        User user = me(userId);
        if (!passwordEncoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw error(HttpStatus.BAD_REQUEST, "Your current password is wrong");
        }
        if (req.currentPassword().equals(req.newPassword())) {
            throw error(HttpStatus.BAD_REQUEST, "Choose a password different from the current one");
        }
        user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        users.save(user);
        events.publish("PASSWORD_CHANGED", user, appUrl + "/login");
    }

    // ---------- forgot password ----------

    /**
     * Always answers the same way, so it can't be used to find out which emails have accounts.
     * Accepts the main or the alternate email; the link goes to both.
     */
    public void forgotPassword(ForgotPasswordRequest req) {
        String email = normalize(req.email());
        users.findByEmail(email).or(() -> users.findByAlternateEmail(email)).filter(User::isActive).ifPresent(user -> {
            byte[] raw = new byte[32];
            RANDOM.nextBytes(raw);
            String token = HexFormat.of().formatHex(raw);
            user.setResetTokenHash(sha256(token));
            user.setResetExpiresAt(Instant.now().plus(RESET_TTL));
            users.save(user);
            String link = appUrl + "/reset-password?token=" + token + "&email="
                    + java.net.URLEncoder.encode(user.getEmail(), StandardCharsets.UTF_8);
            events.publish("PASSWORD_RESET", user, link);
        });
    }

    public LoginResponse resetPassword(ResetPasswordRequest req) {
        User user = users.findByEmail(normalize(req.email()))
                .filter(u -> u.getResetTokenHash() != null && u.getResetExpiresAt() != null)
                .filter(u -> u.getResetExpiresAt().isAfter(Instant.now()))
                .filter(u -> MessageDigest.isEqual(
                        u.getResetTokenHash().getBytes(StandardCharsets.UTF_8),
                        sha256(req.token()).getBytes(StandardCharsets.UTF_8)))
                .orElseThrow(() -> error(HttpStatus.BAD_REQUEST, "This reset link is invalid or has expired. Please request a new one."));
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setResetTokenHash(null);       // the link works only once
        user.setResetExpiresAt(null);
        user.setLastLoginAt(Instant.now());
        users.save(user);
        events.publish("PASSWORD_CHANGED", user, appUrl + "/login");
        return loginResponse(user);
    }

    // ---------- admin ----------

    public User createStaff(CreateStaffRequest req) {
        String email = normalize(req.email());
        if (users.existsByEmail(email)) throw error(HttpStatus.CONFLICT, "An account with this email already exists");
        User user = new User();
        user.setEmail(email);
        user.setAlternateEmail(alternate(req.alternateEmail(), email));
        user.setName(req.name().trim());
        user.setRole(req.role());
        if (Roles.HOSPITAL.equals(req.role())) {
            if (req.providerId() == null || req.providerId().isBlank()) {
                throw error(HttpStatus.BAD_REQUEST, "Choose the hospital this login belongs to");
            }
            try {
                user.setProviderId(providerClient.byId(req.providerId()).id());
            } catch (FeignException.NotFound e) {
                throw error(HttpStatus.BAD_REQUEST, "That hospital doesn't exist");
            }
        }
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setCreatedAt(Instant.now());
        user = save(user);
        events.publish("STAFF_CREATED", user, appUrl + "/login");
        return user;
    }

    public List<User> listUsers() {
        return users.findAllByOrderByRoleAscNameAsc();
    }

    public User setActive(String adminId, String userId, boolean active) {
        if (userId.equals(adminId) && !active) throw error(HttpStatus.BAD_REQUEST, "You can't switch off your own account");
        User user = users.findById(userId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "User not found"));
        user.setActive(active);
        return users.save(user);
    }

    /** For notification-service: who to email about a policy's claims. */
    public User accountForPatient(String patientId) {
        return users.findByPatientId(patientId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "No account for this policy"));
    }

    // ---------- helpers ----------

    private User save(User user) {
        try {
            return users.save(user);
        } catch (DuplicateKeyException e) {
            throw error(HttpStatus.CONFLICT, "This email or policy already has an account");
        }
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String alternate(String alternateEmail, String mainEmail) {
        if (alternateEmail == null || alternateEmail.isBlank()) return null;
        String alt = normalize(alternateEmail);
        if (alt.equals(mainEmail)) throw error(HttpStatus.BAD_REQUEST, "Alternate email must be different from your main email");
        return alt;
    }

    static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static ResponseStatusException error(HttpStatus status, String message) {
        return new ResponseStatusException(status, message);
    }
}
