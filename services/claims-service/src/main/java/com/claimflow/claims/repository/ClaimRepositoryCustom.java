package com.claimflow.claims.repository;

import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.FraudAssessment;
import com.claimflow.claims.dto.ClaimStats;

import java.util.Optional;

public interface ClaimRepositoryCustom {

    /** Next readable claim number for this year, e.g. CLM-2026-000124. Safe when called in parallel. */
    String nextClaimNumber(int year);

    /**
     * APPROVED → PAID in one atomic update. Returns the paid claim, or empty if the claim
     * wasn't APPROVED at that moment (already PAID, rejected, or not found).
     */
    Optional<Claim> markPaidIfApproved(String id, String paymentReference);

    /**
     * Takes the review lock: succeeds for exactly one caller while the claim is UNDER_REVIEW or
     * INFO_REQUESTED, so two officers approving at the same moment can't both reserve coverage.
     */
    Optional<Claim> lockForReview(String id);

    /** Stores Gemini's review without overwriting anything an officer changed meanwhile. */
    void saveAiReview(String id, FraudAssessment.AiStatus status, String summary, String recommendation);

    /** Counts and amounts by status and by fraud level, for the officer/admin dashboard. */
    ClaimStats stats();
}
