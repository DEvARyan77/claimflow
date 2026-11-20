package com.claimflow.claims.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The policyholder's or hospital's reply to an officer's request for information. */
public record InfoRequest(@NotBlank(message = "Write your reply") @Size(max = 1000) String note) {
}
