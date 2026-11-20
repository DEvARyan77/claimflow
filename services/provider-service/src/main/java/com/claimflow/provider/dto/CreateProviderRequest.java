package com.claimflow.provider.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.Set;

public record CreateProviderRequest(
        @NotBlank String registrationNumber,
        @NotBlank String name,
        @NotBlank String city,
        @NotEmpty Set<String> specializations,
        Boolean inNetwork
) {
}
