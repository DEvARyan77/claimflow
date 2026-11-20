package com.claimflow.patient.dto;

import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** What a policyholder can change about themselves. Email and policy details are not editable here. */
public record ProfileRequest(
        @Size(min = 2, max = 80) String name,
        @Pattern(regexp = "^$|^[0-9+\\- ]{6,20}$", message = "Enter a valid phone number") String phone,
        @Size(max = 300) String address,
        @Past(message = "Date of birth must be in the past") LocalDate dateOfBirth,
        @Pattern(regexp = "^$|^(male|female|other)$", message = "Gender must be male, female or other") String gender
) {
}
