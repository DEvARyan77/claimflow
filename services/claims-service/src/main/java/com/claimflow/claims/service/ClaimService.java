package com.claimflow.claims.service;

import com.claimflow.claims.client.PatientDto;
import com.claimflow.claims.client.ProviderDto;
import com.claimflow.claims.dto.Caller;
import com.claimflow.claims.dto.ClaimRequest;
import com.claimflow.claims.dto.ClaimStats;
import com.claimflow.claims.dto.InfoRequest;
import com.claimflow.claims.dto.ReviewRequest;
import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.ClaimStatus;
import com.claimflow.claims.entity.ClaimType;
import com.claimflow.claims.entity.FraudAssessment;
import com.claimflow.claims.entity.FraudAssessment.AiStatus;
import com.claimflow.claims.entity.FraudAssessment.Level;
import com.claimflow.claims.entity.ReviewNote;
import com.claimflow.claims.entity.ReviewNote.Action;
import com.claimflow.claims.exception.BadClaimRequestException;
import com.claimflow.claims.exception.ClaimNotFoundException;
import com.claimflow.claims.exception.DependencyUnavailableException;
import com.claimflow.claims.exception.ForbiddenException;
import com.claimflow.claims.exception.InvalidClaimStateException;
import com.claimflow.claims.repository.ClaimRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Claim flow:
 *   submit → verify policy, hospital, cover (ClaimRules) → fraud check (FraudRules)
 *     LOW risk         → coverage reserved → APPROVED (or REJECTED)
 *     MEDIUM / HIGH    → UNDER_REVIEW, Gemini writes a summary in the background
 *   officer: APPROVE / REJECT / REQUEST_INFO (→ INFO_REQUESTED → owner replies → UNDER_REVIEW)
 *   payment-service pays APPROVED claims → PAID
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ClaimService {

    private static final Set<ClaimStatus> REVIEWABLE = Set.of(ClaimStatus.UNDER_REVIEW, ClaimStatus.INFO_REQUESTED);

    private final ClaimRepository claimRepository;
    private final VerificationClient verificationClient;
    private final ClaimEventPublisher eventPublisher;
    private final AiFraudReviewer aiFraudReviewer;

    // ---------------------------------------------------------------- submit

    /** POST /claims. Policyholders file reimbursement claims for themselves; hospitals file cashless claims. */
    public Claim submitClaim(ClaimRequest request, Caller caller) {
        ClaimType type = ClaimType.REIMBURSEMENT;
        if (caller.isPolicyholder() && !request.patientId().equals(caller.patientId())) {
            throw new ForbiddenException("You can only claim on your own policy");
        }
        if (caller.isHospital()) {
            if (!request.providerId().equals(caller.providerId())) {
                throw new ForbiddenException("A hospital can only raise claims for its own patients");
            }
            type = ClaimType.CASHLESS;
        }
        validateDates(request.admissionDate(), request.dischargeDate());

        Claim claim = new Claim();
        claim.setType(type);
        claim.setPatientId(request.patientId());
        claim.setProviderId(request.providerId());
        claim.setDiagnosisCode(request.diagnosisCode().trim().toUpperCase());
        claim.setTreatment(blankToNull(request.treatment()));
        claim.setDescription(blankToNull(request.description()));
        claim.setAmount(request.amount());
        claim.setAdmissionDate(request.admissionDate());
        claim.setDischargeDate(request.dischargeDate());
        claim.setExtraEmail(request.extraEmail() == null || request.extraEmail().isBlank()
                ? null : request.extraEmail().trim().toLowerCase());
        claim.setSubmittedByUserId(caller.userId());
        claim.setSubmittedByRole(caller.role());
        claim.setSubmittedByName(caller.name());
        claim.setStatus(ClaimStatus.SUBMITTED);
        claim.setCreatedAt(LocalDateTime.now());
        claim.setClaimNumber(claimRepository.nextClaimNumber(claim.getCreatedAt().getYear()));
        claim = claimRepository.save(claim);

        PatientDto patient = decide(claim);
        claimRepository.save(claim);
        eventPublisher.publish(claim);
        startAiReviewIfNeeded(claim, patient);
        return forCaller(claim, caller);
    }

    /** Called by PendingClaimRetryJob for claims stuck in SUBMITTED. Publishes only if the status changed. */
    public void retryPendingClaim(Claim claim) {
        PatientDto patient = decide(claim);
        if (claim.getStatus() != ClaimStatus.SUBMITTED) {
            claimRepository.save(claim);
            eventPublisher.publish(claim);
            startAiReviewIfNeeded(claim, patient);
            log.info("Pending claim {} is now {}", claim.getClaimNumber(), claim.getStatus());
        }
    }

    /**
     * Runs the checklist (policy → hospital → cover), then the fraud check. Sets status + reason.
     * Returns the patient (for the AI review), or null.
     */
    private PatientDto decide(Claim claim) {
        try {
            PatientDto patient = verificationClient.findPatient(claim.getPatientId()).orElse(null);
            ProviderDto provider = verificationClient.findProvider(claim.getProviderId()).orElse(null);

            Optional<String> rejectionReason = ClaimRules.findRejectionReason(patient, provider, claim.getAmount());
            if (rejectionReason.isPresent()) {
                markDecided(claim, ClaimStatus.REJECTED, rejectionReason.get());
                return patient;
            }

            FraudAssessment fraud = FraudRules.assess(claim,
                    new FraudRules.PolicyFacts(patient.getPolicyStartDate(), patient.getCoverageLimit(), patient.getUsedAmount()),
                    claimRepository.findByPatientIdAndCreatedAtAfter(claim.getPatientId(), LocalDateTime.now().minusDays(90)));
            claim.setFraud(fraud);

            if (fraud.getLevel() != Level.LOW) {
                fraud.setAiStatus(AiStatus.PENDING);
                claim.setStatus(ClaimStatus.UNDER_REVIEW);
                claim.setReason("Our claims team is reviewing this claim. We'll update you soon.");
                log.info("Claim {} flagged {} (score {}): {}", claim.getClaimNumber(), fraud.getLevel(), fraud.getScore(),
                        fraud.getFlags().stream().map(FraudAssessment.Flag::getCode).collect(Collectors.joining(", ")));
                return patient;
            }
            fraud.setAiStatus(AiStatus.SKIPPED);
            reserveAndDecide(claim);
            return patient;
        } catch (DependencyUnavailableException e) {
            log.warn("Claim {} kept SUBMITTED: {}", claim.getClaimNumber(), e.getMessage());
            claim.setStatus(ClaimStatus.SUBMITTED);
            claim.setReason("Verification pending: " + e.getServiceName() + " is unavailable. We'll retry automatically.");
            return null;
        }
    }

    /** Atomic: only one claim can use the last of the cover. */
    private void reserveAndDecide(Claim claim) {
        if (verificationClient.reserveCoverage(claim.getPatientId(), claim.getAmount())) {
            markDecided(claim, ClaimStatus.APPROVED, null);
        } else {
            // Another claim used the coverage between our check and the reservation
            markDecided(claim, ClaimStatus.REJECTED, "Coverage limit exceeded");
        }
    }

    private void startAiReviewIfNeeded(Claim claim, PatientDto patient) {
        if (claim.getStatus() == ClaimStatus.UNDER_REVIEW && claim.getFraud() != null
                && claim.getFraud().getAiStatus() == AiStatus.PENDING) {
            aiFraudReviewer.review(claim.getId(), patient);
        }
    }

    // ---------------------------------------------------------------- officer review

    /** POST /claims/{id}/review: officers and admins only. */
    public Claim review(String id, ReviewRequest request, Caller caller) {
        if (!caller.isStaff() && !caller.isInternal()) {
            throw new ForbiddenException("Only claims officers can review claims");
        }
        String note = blankToNull(request.note());
        if ((request.action() == Action.REJECT || request.action() == Action.REQUEST_INFO) && note == null) {
            throw new BadClaimRequestException(request.action() == Action.REJECT
                    ? "Write the reason for rejecting" : "Write what information you need");
        }

        if (request.action() == Action.NOTE) {
            if (note == null) throw new BadClaimRequestException("Write a note");
            Claim claim = getClaim(id);
            claim.getReviewNotes().add(noteBy(caller, Action.NOTE, note));
            return claimRepository.save(claim);
        }
        if (request.action() == Action.INFO_ADDED) {
            throw new BadClaimRequestException("Choose approve, reject, request information or note");
        }

        // One decision at a time: the lock stops two officers approving (and reserving cover) twice
        Claim claim = claimRepository.lockForReview(id).orElseThrow(() -> notReviewable(id));
        try {
            switch (request.action()) {
                case APPROVE -> approveAfterReview(claim);
                case REJECT -> markDecided(claim, ClaimStatus.REJECTED, "Rejected after review: " + note);
                case REQUEST_INFO -> {
                    claim.setStatus(ClaimStatus.INFO_REQUESTED);
                    claim.setReason("More information needed: " + note);
                }
                default -> throw new IllegalStateException();
            }
        } catch (RuntimeException e) {
            claim.setReviewLock(null);
            claimRepository.save(claim);
            throw e;
        }
        claim.getReviewNotes().add(noteBy(caller, request.action(), note));
        claim.setReviewLock(null);
        claim = claimRepository.save(claim);
        eventPublisher.publish(claim);
        log.info("Claim {} reviewed by {}: {} → {}", claim.getClaimNumber(), caller.name(), request.action(), claim.getStatus());
        return claim;
    }

    /** Checks the policy and hospital again (things may have changed), then reserves the cover. */
    private void approveAfterReview(Claim claim) {
        PatientDto patient = verificationClient.findPatient(claim.getPatientId()).orElse(null);
        ProviderDto provider = verificationClient.findProvider(claim.getProviderId()).orElse(null);
        Optional<String> rejectionReason = ClaimRules.findRejectionReason(patient, provider, claim.getAmount());
        if (rejectionReason.isPresent()) {
            markDecided(claim, ClaimStatus.REJECTED, rejectionReason.get());
        } else {
            reserveAndDecide(claim);
        }
    }

    /** POST /claims/{id}/info: the policyholder or hospital answers the officer's question. */
    public Claim addInfo(String id, InfoRequest request, Caller caller) {
        Claim existing = getClaim(id);
        if (!canSee(existing, caller) || caller.isStaff()) {
            throw new ClaimNotFoundException(id);
        }
        if (existing.getStatus() != ClaimStatus.INFO_REQUESTED) {
            throw new InvalidClaimStateException("Claim " + existing.getClaimNumber() + " isn't waiting for information");
        }
        Claim claim = claimRepository.lockForReview(id).orElseThrow(() -> notReviewable(id));
        if (claim.getStatus() != ClaimStatus.INFO_REQUESTED) {
            claim.setReviewLock(null);
            claimRepository.save(claim);
            throw new InvalidClaimStateException("Claim " + claim.getClaimNumber() + " isn't waiting for information");
        }
        claim.getReviewNotes().add(noteBy(caller, Action.INFO_ADDED, request.note().trim()));
        claim.setStatus(ClaimStatus.UNDER_REVIEW);
        claim.setReason("Thanks, we've got your reply. Our claims team is reviewing this claim.");
        claim.setReviewLock(null);
        return forCaller(claimRepository.save(claim), caller);
    }

    private RuntimeException notReviewable(String id) {
        Claim claim = getClaim(id);
        if (Boolean.TRUE.equals(claim.getReviewLock())) {
            return new InvalidClaimStateException("Someone else is deciding claim " + claim.getClaimNumber() + " right now");
        }
        return new InvalidClaimStateException("Claim " + claim.getClaimNumber() + " is " + claim.getStatus()
                + " and can't be reviewed");
    }

    private static ReviewNote noteBy(Caller caller, Action action, String note) {
        return new ReviewNote(action, note, caller.userId(), caller.name(), caller.role(), LocalDateTime.now());
    }

    // ---------------------------------------------------------------- payment

    /**
     * Called by payment-service once the hospital is paid. Safe to call twice: APPROVED → PAID is
     * one atomic conditional update, so a repeated call can never publish "paid" a second time.
     */
    public Claim markPaid(String claimId, String paymentReference) {
        return claimRepository.markPaidIfApproved(claimId, paymentReference)
                .map(paid -> {
                    eventPublisher.publish(paid);
                    return paid;
                })
                .orElseGet(() -> {
                    Claim claim = getClaim(claimId);
                    if (claim.getStatus() == ClaimStatus.PAID) {
                        return claim;              // already paid: nothing to do
                    }
                    throw new InvalidClaimStateException("Only APPROVED claims can be paid; claim "
                            + claim.getClaimNumber() + " is " + claim.getStatus());
                });
    }

    // ---------------------------------------------------------------- reading

    public Claim getClaim(String id) {
        return claimRepository.findById(id).orElseThrow(() -> new ClaimNotFoundException(id));
    }

    /** GET /claims/{id}: a policyholder sees only their claims, a hospital only its own. Others get 404. */
    public Claim getClaimFor(String id, Caller caller) {
        Claim claim = getClaim(id);
        if (!canSee(claim, caller)) {
            throw new ClaimNotFoundException(id);
        }
        return forCaller(claim, caller);
    }

    public List<Claim> getClaimsByPatient(String patientId, Caller caller) {
        return forCaller(claimRepository.findByPatientIdOrderByCreatedAtDesc(patientId), caller);
    }

    public List<Claim> getClaimsByProvider(String providerId, Caller caller) {
        return forCaller(claimRepository.findByProviderIdOrderByCreatedAtDesc(providerId), caller);
    }

    public List<Claim> getAllClaims() {
        return claimRepository.findAllByOrderByCreatedAtDesc();
    }

    /** Flagged claims, riskiest first, then oldest first. */
    public List<Claim> reviewQueue() {
        return claimRepository.findByStatusIn(REVIEWABLE,
                Sort.by(Sort.Order.desc("fraud.score"), Sort.Order.asc("createdAt")));
    }

    public ClaimStats stats() {
        return claimRepository.stats();
    }

    public List<Claim> getPendingClaimsOlderThan(LocalDateTime before) {
        return claimRepository.findByStatusAndCreatedAtBefore(ClaimStatus.SUBMITTED, before);
    }

    // ---------------------------------------------------------------- helpers

    private static boolean canSee(Claim claim, Caller caller) {
        if (caller.isInternal() || caller.isStaff()) return true;
        if (caller.isPolicyholder()) return claim.getPatientId().equals(caller.patientId());
        if (caller.isHospital()) return claim.getProviderId().equals(caller.providerId());
        return false;
    }

    private static List<Claim> forCaller(List<Claim> claims, Caller caller) {
        claims.forEach(c -> forCaller(c, caller));
        return claims;
    }

    /** Fraud scores and officers' internal notes are for staff only. */
    private static Claim forCaller(Claim claim, Caller caller) {
        if (caller.isInternal() || caller.isStaff()) return claim;
        claim.setFraud(null);
        claim.setReviewLock(null);
        List<ReviewNote> visible = new ArrayList<>(claim.getReviewNotes() == null ? List.of() : claim.getReviewNotes());
        visible.removeIf(n -> n.getAction() == Action.NOTE);
        visible.forEach(n -> {
            if (n.getAction() != Action.INFO_ADDED) {
                n.setByName("Claims team");   // the officer's name stays internal
                n.setByUserId(null);
            }
        });
        claim.setReviewNotes(visible);
        return claim;
    }

    private static void validateDates(LocalDate admitted, LocalDate discharged) {
        LocalDate today = LocalDate.now();
        if (admitted != null && admitted.isAfter(today)) {
            throw new BadClaimRequestException("The admission date can't be in the future");
        }
        if (discharged != null && discharged.isAfter(today.plusDays(30))) {
            throw new BadClaimRequestException("The discharge date is too far ahead");
        }
        if (admitted != null && discharged != null && discharged.isBefore(admitted)) {
            throw new BadClaimRequestException("The discharge date can't be before the admission date");
        }
        if (discharged != null && admitted == null) {
            throw new BadClaimRequestException("Enter the admission date too");
        }
    }

    private void markDecided(Claim claim, ClaimStatus status, String reason) {
        claim.setStatus(status);
        claim.setReason(reason);
        claim.setDecidedAt(LocalDateTime.now());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
