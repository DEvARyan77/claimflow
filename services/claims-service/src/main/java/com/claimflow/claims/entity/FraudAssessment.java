package com.claimflow.claims.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * The fraud check's result, stored inside the claim.
 * score 0-100 from the red flags; LOW claims are decided automatically, MEDIUM and HIGH go to an officer.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FraudAssessment {

    public enum Level { LOW, MEDIUM, HIGH }

    /** PENDING = Gemini is reviewing; DONE; OFF = no AI key; FAILED = AI unavailable; SKIPPED = low risk. */
    public enum AiStatus { PENDING, DONE, OFF, FAILED, SKIPPED }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Flag {
        private String code;     // e.g. EARLY_CLAIM
        private String label;    // short, for a badge: "Soon after policy start"
        private int points;
        private String detail;   // the facts behind it: "Admitted 12 days after cover started"
    }

    private int score;
    private Level level;
    private List<Flag> flags = new ArrayList<>();

    private AiStatus aiStatus;
    private String aiSummary;          // Gemini's short explanation for the officer
    private String aiRecommendation;   // APPROVE / INVESTIGATE / REJECT: advice only, never automatic

    private LocalDateTime assessedAt;
}
