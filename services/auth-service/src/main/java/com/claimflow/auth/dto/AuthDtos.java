package com.claimflow.auth.dto;

import com.claimflow.auth.entity.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/** Request and response bodies for the auth endpoints. */
public final class AuthDtos {

    private AuthDtos() {
    }

    private static final String PASSWORD_RULE = "Use at least 8 characters";

    /**
     * Policyholder sign-up. With a policyNumber, the account is linked to that existing policy (the email
     * must match the policy's email). Without one, a new demo policy is issued.
     */
    public record RegisterRequest(
            @NotBlank @Size(min = 2, max = 80) String name,
            @NotBlank @Email @Size(max = 120) String email,
            @Email(message = "Enter a valid alternate email") @Size(max = 120) String alternateEmail,
            @NotBlank @Size(min = 8, max = 100, message = PASSWORD_RULE) String password,
            @Size(max = 20) String phone,
            @Size(max = 20) String policyNumber,
            // Set when the details were read from an uploaded policy document: the policy is created
            // with this number and cover if it isn't on file yet
            Boolean fromPolicyDocument,
            @jakarta.validation.constraints.Positive @jakarta.validation.constraints.Max(value = 100_000_000, message = "That cover looks too large") java.math.BigDecimal coverageLimit) {
    }

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {
    }

    public record LoginResponse(String token, UserView user) {
    }

    public record UpdateMeRequest(
            @Size(min = 2, max = 80) String name,
            @Email(message = "Enter a valid alternate email") @Size(max = 120) String alternateEmail) {
    }

    public record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 8, max = 100, message = PASSWORD_RULE) String newPassword) {
    }

    public record ForgotPasswordRequest(@NotBlank @Email String email) {
    }

    public record ResetPasswordRequest(
            @NotBlank @Email String email,
            @NotBlank @Pattern(regexp = "^[a-f0-9]{64}$", message = "This reset link is not valid") String token,
            @NotBlank @Size(min = 8, max = 100, message = PASSWORD_RULE) String password) {
    }

    /** Admin creates a hospital, officer or admin login. */
    public record CreateStaffRequest(
            @NotBlank @Size(min = 2, max = 80) String name,
            @NotBlank @Email @Size(max = 120) String email,
            @Email @Size(max = 120) String alternateEmail,
            @NotBlank @Size(min = 8, max = 100, message = PASSWORD_RULE) String password,
            @NotBlank @Pattern(regexp = "HOSPITAL|OFFICER|ADMIN", message = "Role must be HOSPITAL, OFFICER or ADMIN") String role,
            String providerId) {
    }

    public record SetActiveRequest(boolean active) {
    }

    public record Message(String message) {
    }

    /** What the app sees about a user: never the password hash or reset token. */
    public record UserView(String id, String email, String alternateEmail, String name, String role,
                           String patientId, String providerId, boolean active, Instant createdAt, Instant lastLoginAt) {
        public static UserView of(User u) {
            return new UserView(u.getId(), u.getEmail(), u.getAlternateEmail(), u.getName(), u.getRole(),
                    u.getPatientId(), u.getProviderId(), u.isActive(), u.getCreatedAt(), u.getLastLoginAt());
        }
    }
}
