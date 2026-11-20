package com.claimflow.claims.service;

import com.claimflow.claims.entity.Claim;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * If Patient or Provider service was down when a claim arrived, the claim stays SUBMITTED.
 * This job re-checks those claims automatically once the services are back.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PendingClaimRetryJob {

    private final ClaimService claimService;

    @Scheduled(fixedDelayString = "${claimflow.claims.retry-pending-interval-ms:30000}", initialDelay = 20000)
    public void retryPendingClaims() {
        // skip claims created in the last 10 s: they may still be in the middle of their first check
        List<Claim> pending = claimService.getPendingClaimsOlderThan(LocalDateTime.now().minusSeconds(10));
        if (!pending.isEmpty()) {
            log.info("Retrying {} pending claim(s)", pending.size());
        }
        pending.forEach(claimService::retryPendingClaim);
    }
}
