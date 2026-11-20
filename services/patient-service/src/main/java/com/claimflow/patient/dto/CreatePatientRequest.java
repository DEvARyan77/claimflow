package com.claimflow.patient.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CreatePatientRequest(
        @NotBlank String name,
        @NotBlank @Email String email,
        String phone,
        @NotBlank String policyNumber,
        @NotNull @Positive BigDecimal coverageLimit,
        Boolean policyActive,
        LocalDate policyStartDate      // optional: defaults to today
) {
    public CreatePatientRequest(String name, String email, String phone, String policyNumber,
                                BigDecimal coverageLimit, Boolean policyActive) {
        this(name, email, phone, policyNumber, coverageLimit, policyActive, null);
    }
}
