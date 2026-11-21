package com.claimflow.patient.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** auth-service asks for a policy for someone signing up: a new demo policy, or the one on their uploaded document. */
public record EnrolRequest(
        @NotBlank @Size(max = 80) String name,
        @NotBlank @Email String email,
        @Size(max = 20) String phone,
        @Size(max = 20) String policyNumber,       // from an uploaded policy; null = issue a new number
        @jakarta.validation.constraints.Positive java.math.BigDecimal coverageLimit  // null = ₹5,00,000
) {
}
