package com.claimflow.claims.service;

import com.claimflow.claims.client.*;
import com.claimflow.claims.exception.DependencyUnavailableException;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import org.springframework.cloud.client.circuitbreaker.CircuitBreakerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Every call to another service goes through a circuit breaker.
 * - 404 / 409 are normal business answers, so they are handled INSIDE the call (they don't trip the breaker).
 * - Timeouts, connection errors and 5xx DO trip it; the fallback throws DependencyUnavailableException,
 *   and the claim stays SUBMITTED until PendingClaimRetryJob tries again.
 */
@Component
@RequiredArgsConstructor
public class VerificationClient {

    private final PatientClient patientClient;
    private final ProviderClient providerClient;
    private final CircuitBreakerFactory<?, ?> circuitBreakerFactory;

    public Optional<PatientDto> findPatient(String patientId) {
        return circuitBreakerFactory.create("patient-service").run(
                () -> {
                    try {
                        return Optional.of(patientClient.getPatient(patientId));
                    } catch (FeignException.NotFound e) {
                        return Optional.<PatientDto>empty();
                    }
                },
                error -> {
                    throw new DependencyUnavailableException("patient-service", error);
                });
    }

    public Optional<ProviderDto> findProvider(String providerId) {
        return circuitBreakerFactory.create("provider-service").run(
                () -> {
                    try {
                        return Optional.of(providerClient.getProvider(providerId));
                    } catch (FeignException.NotFound e) {
                        return Optional.<ProviderDto>empty();
                    }
                },
                error -> {
                    throw new DependencyUnavailableException("provider-service", error);
                });
    }

    /** @return true if the coverage was reserved, false if the patient no longer has enough (409). */
    public boolean reserveCoverage(String patientId, BigDecimal amount) {
        return circuitBreakerFactory.create("patient-service").run(
                () -> {
                    try {
                        patientClient.addUsedAmount(patientId, new UsedAmountRequest(amount));
                        return true;
                    } catch (FeignException.Conflict e) {
                        return false;
                    }
                },
                error -> {
                    throw new DependencyUnavailableException("patient-service", error);
                });
    }
}
