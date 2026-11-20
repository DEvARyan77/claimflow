package com.claimflow.auth.entity;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/** A login, stored in the "users" collection of auth_db. */
@Document("users")
@Data
@NoArgsConstructor
public class User {

    @Id
    private String id;

    @Indexed(unique = true)
    private String email;                // lower-case; used to sign in

    private String alternateEmail;       // optional; gets a copy of every email

    private String passwordHash;         // BCrypt, never the password itself

    private String name;

    private String role;                 // POLICYHOLDER, HOSPITAL, OFFICER, ADMIN (see Roles)

    /** POLICYHOLDER: their policy in patient-service. One login per policy. */
    @Indexed(unique = true, sparse = true)
    private String patientId;

    /** HOSPITAL: their hospital in provider-service. */
    private String providerId;

    private boolean active = true;

    private String resetTokenHash;       // SHA-256 of the emailed reset token; the token itself is never stored
    private Instant resetExpiresAt;

    private Instant createdAt;
    private Instant lastLoginAt;
}
