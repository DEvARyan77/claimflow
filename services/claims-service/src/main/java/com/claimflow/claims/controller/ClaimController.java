package com.claimflow.claims.controller;

import com.claimflow.claims.dto.ClaimRequest;
import com.claimflow.claims.dto.MarkPaidRequest;
import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.service.ClaimService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/claims")
@RequiredArgsConstructor
public class ClaimController {

    private final ClaimService claimService;

    @PostMapping
    public ResponseEntity<Claim> submit(@Valid @RequestBody ClaimRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(claimService.submitClaim(request));
    }

    @GetMapping
    public List<Claim> getAll() {
        return claimService.getAllClaims();
    }

    @GetMapping("/{id}")
    public Claim getById(@PathVariable String id) {
        return claimService.getClaim(id);
    }

    @GetMapping("/patient/{patientId}")
    public List<Claim> getByPatient(@PathVariable String patientId) {
        return claimService.getClaimsByPatient(patientId);
    }

    /** Internal: used by payment-service. */
    @PostMapping("/{id}/mark-paid")
    public Claim markPaid(@PathVariable String id, @RequestBody MarkPaidRequest request) {
        return claimService.markPaid(id, request.paymentReference());
    }
}
