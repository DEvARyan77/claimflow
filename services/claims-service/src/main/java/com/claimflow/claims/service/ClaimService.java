package com.claimflow.claims.service;

import com.claimflow.claims.client.PatientDto;
import com.claimflow.claims.client.ProviderDto;
import com.claimflow.claims.dto.ClaimRequest;
import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.ClaimStatus;
import com.claimflow.claims.exception.ClaimNotFoundException;
import com.claimflow.claims.exception.DependencyUnavailableException;
import com.claimflow.claims.exception.InvalidClaimStateException;
import com.claimflow.claims.repository.ClaimRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class ClaimService {

    private final ClaimRepository claimRepository;
    private final VerificationClient verificationClient;
    private final ClaimEventPublisher eventPublisher;

    /** POST /claims: save first (so the claim has an ID), then verify and decide. */
    public Claim submitClaim(ClaimRequest request) {
        Claim claim = new Claim();
        claim.setPatientId(request.patientId());
        claim.setProviderId(request.providerId());
        claim.setDiagnosisCode(request.diagnosisCode().trim().toUpperCase());
        claim.setDescription(request.description());
        claim.setAmount(request.amount());
        claim.setExtraEmail(request.extraEmail() == null || request.extraEmail().isBlank()
                ? null : request.extraEmail().trim().toLowerCase());
        claim.setStatus(ClaimStatus.SUBMITTED);
        claim = claimRepository.save(claim);

        decide(claim);
        claimRepository.save(claim);
        eventPublisher.publish(claim);
        return claim;
    }

    /** Called by PendingClaimRetryJob for claims stuck in SUBMITTED. Publishes only if the status changed. */
    public void retryPendingClaim(Claim claim) {
        decide(claim);
        if (claim.getStatus() != ClaimStatus.SUBMITTED) {
            claimRepository.save(claim);
            eventPublisher.publish(claim);
            log.info("Pending claim {} is now {}", claim.getId(), claim.getStatus());
        }
    }

    /** Runs the checklist: patient → hospital → coverage. Sets status + reason on the claim. */
    private void decide(Claim claim) {
        try {
            PatientDto patient = verificationClient.findPatient(claim.getPatientId()).orElse(null);
            ProviderDto provider = verificationClient.findProvider(claim.getProviderId()).orElse(null);

            Optional<String> rejectionReason = ClaimRules.findRejectionReason(patient, provider, claim.getAmount());
            if (rejectionReason.isPresent()) {
                markDecided(claim, ClaimStatus.REJECTED, rejectionReason.get());
            } else if (verificationClient.reserveCoverage(claim.getPatientId(), claim.getAmount())) {
                markDecided(claim, ClaimStatus.APPROVED, null);
            } else {
                // Another claim used the coverage between our check and the reservation
                markDecided(claim, ClaimStatus.REJECTED, "Coverage limit exceeded");
            }
        } catch (DependencyUnavailableException e) {
            log.warn("Claim {} kept SUBMITTED: {}", claim.getId(), e.getMessage());
            claim.setStatus(ClaimStatus.SUBMITTED);
            claim.setReason("Verification pending: " + e.getServiceName() + " is unavailable. We'll retry automatically.");
        }
    }

    private void markDecided(Claim claim, ClaimStatus status, String reason) {
        claim.setStatus(status);
        claim.setReason(reason);
        claim.setDecidedAt(LocalDateTime.now());
    }

    /** Called by payment-service once the hospital is paid. Safe to call twice. */
    @Transactional
    public Claim markPaid(Long claimId, String paymentReference) {
        Claim claim = getClaim(claimId);
        if (claim.getStatus() == ClaimStatus.PAID) {
            return claim;
        }
        if (claim.getStatus() != ClaimStatus.APPROVED) {
            throw new InvalidClaimStateException("Only APPROVED claims can be paid; claim " + claimId + " is " + claim.getStatus());
        }
        claim.setStatus(ClaimStatus.PAID);
        claim.setPaymentReference(paymentReference);
        claim.setPaidAt(LocalDateTime.now());
        claimRepository.save(claim);
        eventPublisher.publish(claim);
        return claim;
    }

    public Claim getClaim(Long id) {
        return claimRepository.findById(id).orElseThrow(() -> new ClaimNotFoundException(id));
    }

    public List<Claim> getClaimsByPatient(Long patientId) {
        return claimRepository.findByPatientIdOrderByCreatedAtDesc(patientId);
    }

    public List<Claim> getAllClaims() {
        return claimRepository.findAllByOrderByCreatedAtDesc();
    }

    public List<Claim> getPendingClaimsOlderThan(LocalDateTime before) {
        return claimRepository.findByStatusAndCreatedAtBefore(ClaimStatus.SUBMITTED, before);
    }
}
