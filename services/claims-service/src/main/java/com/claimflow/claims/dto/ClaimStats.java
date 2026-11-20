package com.claimflow.claims.dto;

import java.math.BigDecimal;
import java.util.Map;

/** Dashboard numbers: claims per status (count + total amount) and per fraud risk level. */
public record ClaimStats(long total, Map<String, Bucket> byStatus, Map<String, Long> byRisk) {
    public record Bucket(long count, BigDecimal amount) {
    }
}
