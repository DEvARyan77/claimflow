package com.claimflow.claims.entity;

public enum ClaimStatus {
    SUBMITTED,       // received; waiting for verification (or a dependency was down and it will be retried)
    UNDER_REVIEW,    // the fraud check flagged it: a claims officer decides
    INFO_REQUESTED,  // the officer asked the policyholder / hospital for more information
    APPROVED,        // all rules passed, coverage reserved, waiting for payment
    REJECTED,        // a rule failed or the officer rejected it; see reason
    PAID             // payment-service paid the hospital
}
