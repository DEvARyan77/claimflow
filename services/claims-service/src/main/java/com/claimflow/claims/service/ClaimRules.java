package com.claimflow.claims.service;

import com.claimflow.claims.client.PatientDto;
import com.claimflow.claims.client.ProviderDto;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Optional;

/**
 * The approval rules, as plain Java with no Spring and no HTTP, so they are easy to unit test.
 * Returns the rejection reason, or empty when the claim can be approved.
 */
public final class ClaimRules {

    private ClaimRules() {
    }

    public static Optional<String> findRejectionReason(PatientDto patient, ProviderDto provider, BigDecimal amount) {
        // Rule 1: the patient exists and the policy is active
        if (patient == null) {
            return Optional.of("Patient not found");
        }
        if (!Boolean.TRUE.equals(patient.getPolicyActive())) {
            return Optional.of("Policy is inactive");
        }

        // Rule 2: the hospital exists and is in the insurer's network
        if (provider == null) {
            return Optional.of("Hospital not found");
        }
        if (!Boolean.TRUE.equals(provider.getInNetwork())) {
            return Optional.of(provider.getName() + " is out of network");
        }

        // Rule 3: enough coverage left for this amount
        BigDecimal remaining = remainingCoverage(patient);
        if (amount.compareTo(remaining) > 0) {
            return Optional.of("Coverage limit exceeded (remaining ₹" + format(remaining) + ")");
        }

        return Optional.empty();
    }

    static BigDecimal remainingCoverage(PatientDto patient) {
        BigDecimal limit = patient.getCoverageLimit() == null ? BigDecimal.ZERO : patient.getCoverageLimit();
        BigDecimal used = patient.getUsedAmount() == null ? BigDecimal.ZERO : patient.getUsedAmount();
        return limit.subtract(used);
    }

    private static String format(BigDecimal value) {
        NumberFormat format = NumberFormat.getNumberInstance(Locale.of("en", "IN"));
        format.setMaximumFractionDigits(2);
        return format.format(value);
    }
}
