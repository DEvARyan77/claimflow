package com.claimflow.claims.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** What the frontend / Postman sends to POST /claims */
public record ClaimRequest(
        @NotNull Long patientId,
        @NotNull Long providerId,
        @NotBlank @Size(max = 10) String diagnosisCode,
        @Size(max = 255) String description,
        @NotNull @Positive BigDecimal amount,
        @Email(message = "Enter a valid extra email address") @Size(max = 120) String extraEmail
) {
}
