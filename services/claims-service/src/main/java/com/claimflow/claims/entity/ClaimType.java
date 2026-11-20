package com.claimflow.claims.entity;

public enum ClaimType {
    REIMBURSEMENT,   // the policyholder paid the hospital and claims the money back
    CASHLESS         // the hospital claims directly; the patient pays nothing (in-network only)
}
