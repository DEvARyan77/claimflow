package com.claimflow.claims.entity;

public enum ClaimStatus {
    SUBMITTED,   // received; waiting for verification (or a dependency was down and it will be retried)
    APPROVED,    // all rules passed, coverage reserved, waiting for payment
    REJECTED,    // a rule failed; see reason
    PAID         // payment-service paid the hospital
}
