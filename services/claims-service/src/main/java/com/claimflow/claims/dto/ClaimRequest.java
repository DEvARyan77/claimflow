package com.claimflow.claims.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * What the app sends to POST /claims.
 * A policyholder's patientId must be their own; a hospital's providerId must be its own (checked in ClaimService).
 */
public record ClaimRequest(
        @NotBlank(message = "Choose the policyholder") String patientId,
        @NotBlank(message = "Choose the hospital") String providerId,
        @NotBlank(message = "Choose the treatment") @Size(max = 10) String diagnosisCode,
        @Size(max = 80) String treatment,
        @Size(max = 255) String description,
        @NotNull(message = "Enter the bill amount") @Positive(message = "The amount must be more than zero") BigDecimal amount,
        @Email(message = "Enter a valid extra email address") @Size(max = 120) String extraEmail,
        LocalDate admissionDate,
        LocalDate dischargeDate
) {
}
