package com.claimflow.claims.service;

import com.claimflow.claims.client.FraudReviewClient;
import com.claimflow.claims.client.FraudReviewClient.FlagView;
import com.claimflow.claims.client.PatientDto;
import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.FraudAssessment;
import com.claimflow.claims.entity.FraudAssessment.AiStatus;
import com.claimflow.claims.repository.ClaimRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * Asks Gemini (through policy-assistant-service) to explain a flagged claim to the officer.
 * Runs in the background: the policyholder gets their answer at once, the review appears a few seconds later.
 * Advice only: the officer always makes the decision.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiFraudReviewer {

    private final FraudReviewClient client;
    private final ClaimRepository claimRepository;

    @Async
    public void review(String claimId, PatientDto patient) {
        // reload: the caller's copy may already have been trimmed for the policyholder's view
        Claim claim = claimRepository.findById(claimId).orElse(null);
        if (claim == null || claim.getFraud() == null) return;
        FraudAssessment fraud = claim.getFraud();
        try {
            FraudReviewClient.Review review = client.review(new FraudReviewClient.Request(
                    claim.getClaimNumber(),
                    claim.getType() == null ? null : claim.getType().name(),
                    claim.getDiagnosisCode(),
                    claim.getTreatment(),
                    claim.getAmount(),
                    FraudRules.typicalCost(claim.getDiagnosisCode()),
                    claim.getAdmissionDate(),
                    claim.getDischargeDate(),
                    patient == null ? null : patient.getPolicyStartDate(),
                    patient == null ? null : ClaimRules.remainingCoverage(patient),
                    fraud.getScore(),
                    fraud.getLevel().name(),
                    fraud.getFlags().stream().map(f -> new FlagView(f.getLabel(), f.getDetail(), f.getPoints())).toList()));
            AiStatus status = "DONE".equals(review.status()) ? AiStatus.DONE : AiStatus.OFF;
            claimRepository.saveAiReview(claim.getId(), status, review.summary(), review.recommendation());
            log.info("AI review for {}: {} ({})", claim.getClaimNumber(), review.recommendation(), status);
        } catch (Exception e) {
            log.warn("AI review for {} failed: {}", claim.getClaimNumber(), e.getMessage());
            claimRepository.saveAiReview(claim.getId(), AiStatus.FAILED,
                    "The AI review isn't available right now. The red flags above are from the rule-based check.", null);
        }
    }
}
