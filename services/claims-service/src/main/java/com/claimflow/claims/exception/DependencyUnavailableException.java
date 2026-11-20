package com.claimflow.claims.exception;

import lombok.Getter;

/** Patient or Provider service is down / slow and the circuit breaker gave up. The claim stays SUBMITTED. */
@Getter
public class DependencyUnavailableException extends RuntimeException {

    private final String serviceName;

    public DependencyUnavailableException(String serviceName, Throwable cause) {
        super(serviceName + " is unavailable", cause);
        this.serviceName = serviceName;
    }
}
