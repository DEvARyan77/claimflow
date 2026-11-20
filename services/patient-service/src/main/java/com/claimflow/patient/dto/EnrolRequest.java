package com.claimflow.patient.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** auth-service asks for a new demo policy for someone signing up without one. */
public record EnrolRequest(
        @NotBlank @Size(max = 80) String name,
        @NotBlank @Email String email,
        @Size(max = 20) String phone
) {
}
