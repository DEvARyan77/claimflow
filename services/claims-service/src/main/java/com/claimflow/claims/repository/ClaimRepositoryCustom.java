package com.claimflow.claims.repository;

import com.claimflow.claims.entity.Claim;

import java.util.Optional;

public interface ClaimRepositoryCustom {

    /** Next readable claim number for this year, e.g. CLM-2026-000124. Safe when called in parallel. */
    String nextClaimNumber(int year);

    /**
     * APPROVED → PAID in one atomic update. Returns the paid claim, or empty if the claim
     * wasn't APPROVED at that moment (already PAID, rejected, or not found).
     */
    Optional<Claim> markPaidIfApproved(String id, String paymentReference);
}
