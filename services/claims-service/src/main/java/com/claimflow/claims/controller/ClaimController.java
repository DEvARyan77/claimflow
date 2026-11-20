package com.claimflow.claims.controller;

import com.claimflow.claims.dto.Caller;
import com.claimflow.claims.dto.ClaimRequest;
import com.claimflow.claims.dto.ClaimStats;
import com.claimflow.claims.dto.InfoRequest;
import com.claimflow.claims.dto.MarkPaidRequest;
import com.claimflow.claims.dto.ReviewRequest;
import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.service.ClaimService;
import com.claimflow.security.Roles;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Who may call what is checked first by the gateway (AccessRules); ownership of a single claim is
 * checked here, using the X-User-* headers the gateway sets from the login token.
 */
@RestController
@RequestMapping("/claims")
@RequiredArgsConstructor
public class ClaimController {

    private final ClaimService claimService;

    @ModelAttribute
    public Caller caller(@RequestHeader(value = Roles.HEADER_USER_ID, required = false) String userId,
                         @RequestHeader(value = Roles.HEADER_ROLE, required = false) String role,
                         @RequestHeader(value = Roles.HEADER_NAME, required = false) String name,
                         @RequestHeader(value = Roles.HEADER_PATIENT_ID, required = false) String patientId,
                         @RequestHeader(value = Roles.HEADER_PROVIDER_ID, required = false) String providerId) {
        return Caller.of(userId, role, name, patientId, providerId);
    }

    @PostMapping
    public ResponseEntity<Claim> submit(@Valid @RequestBody ClaimRequest request, @ModelAttribute Caller caller) {
        return ResponseEntity.status(HttpStatus.CREATED).body(claimService.submitClaim(request, caller));
    }

    /** Staff only (gateway). */
    @GetMapping
    public List<Claim> getAll() {
        return claimService.getAllClaims();
    }

    /** Staff only (gateway): flagged claims, riskiest first. */
    @GetMapping("/review-queue")
    public List<Claim> reviewQueue() {
        return claimService.reviewQueue();
    }

    /** Staff only (gateway). */
    @GetMapping("/stats")
    public ClaimStats stats() {
        return claimService.stats();
    }

    @GetMapping("/{id}")
    public Claim getById(@PathVariable String id, @ModelAttribute Caller caller) {
        return claimService.getClaimFor(id, caller);
    }

    @GetMapping("/patient/{patientId}")
    public List<Claim> getByPatient(@PathVariable String patientId, @ModelAttribute Caller caller) {
        return claimService.getClaimsByPatient(patientId, caller);
    }

    @GetMapping("/provider/{providerId}")
    public List<Claim> getByProvider(@PathVariable String providerId, @ModelAttribute Caller caller) {
        return claimService.getClaimsByProvider(providerId, caller);
    }

    @PostMapping("/{id}/review")
    public Claim review(@PathVariable String id, @Valid @RequestBody ReviewRequest request, @ModelAttribute Caller caller) {
        return claimService.review(id, request, caller);
    }

    @PostMapping("/{id}/info")
    public Claim addInfo(@PathVariable String id, @Valid @RequestBody InfoRequest request, @ModelAttribute Caller caller) {
        return claimService.addInfo(id, request, caller);
    }

    /** Internal: used by payment-service. */
    @PostMapping("/{id}/mark-paid")
    public Claim markPaid(@PathVariable String id, @RequestBody MarkPaidRequest request) {
        return claimService.markPaid(id, request.paymentReference());
    }
}
