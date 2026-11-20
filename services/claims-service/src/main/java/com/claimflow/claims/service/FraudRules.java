package com.claimflow.claims.service;

import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.ClaimStatus;
import com.claimflow.claims.entity.FraudAssessment;
import com.claimflow.claims.entity.FraudAssessment.Flag;
import com.claimflow.claims.entity.FraudAssessment.Level;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Explainable fraud scoring: each red flag adds points, and every flag says why it was raised.
 * Plain Java (no Spring, no database), so each rule is unit-tested on its own.
 *
 *   0-29 LOW     decided automatically by the normal rules
 *  30-59 MEDIUM  sent to a claims officer
 *  60+   HIGH    sent to a claims officer, shown first
 *
 * Rules use only what an insurer would have: the policy, this claim and the policyholder's recent claims.
 */
public final class FraudRules {

    public static final int MEDIUM_FROM = 30;
    public static final int HIGH_FROM = 60;

    /**
     * Typical total bill for common treatments (ICD-10 code prefix → ₹), from Indian private hospital
     * price ranges. A bill far above this gets a closer look. Unknown codes are simply not compared.
     */
    static final Map<String, BigDecimal> TYPICAL_COST = Map.ofEntries(
            Map.entry("I21", new BigDecimal("300000")),   // heart attack (angioplasty)
            Map.entry("I63", new BigDecimal("250000")),   // stroke
            Map.entry("J18", new BigDecimal("80000")),    // pneumonia
            Map.entry("K35", new BigDecimal("120000")),   // appendicitis (appendectomy)
            Map.entry("K80", new BigDecimal("100000")),   // gallstones
            Map.entry("S72", new BigDecimal("200000")),   // hip / thigh fracture
            Map.entry("H25", new BigDecimal("40000")),    // cataract
            Map.entry("N20", new BigDecimal("60000")),    // kidney stone
            Map.entry("A90", new BigDecimal("50000")),    // dengue
            Map.entry("A01", new BigDecimal("40000")),    // typhoid
            Map.entry("E11", new BigDecimal("40000")),    // diabetes complications
            Map.entry("O80", new BigDecimal("70000")),    // childbirth
            Map.entry("C50", new BigDecimal("500000")),   // breast cancer
            Map.entry("M17", new BigDecimal("250000")));  // knee osteoarthritis (knee replacement)

    /** What the rules need to know about the policy. */
    public record PolicyFacts(LocalDate policyStartDate, BigDecimal coverageLimit, BigDecimal usedAmount) {
        BigDecimal remaining() {
            BigDecimal limit = coverageLimit == null ? BigDecimal.ZERO : coverageLimit;
            return limit.subtract(usedAmount == null ? BigDecimal.ZERO : usedAmount);
        }
    }

    private FraudRules() {
    }

    /**
     * @param claim       the new claim (amount, provider, diagnosis, admission/discharge, createdAt)
     * @param policy      the policyholder's cover
     * @param otherClaims the same policyholder's other claims from the last 90 days
     */
    public static FraudAssessment assess(Claim claim, PolicyFacts policy, List<Claim> otherClaims) {
        List<Flag> flags = new ArrayList<>();
        LocalDate admitted = claim.getAdmissionDate();
        LocalDate discharged = claim.getDischargeDate();
        LocalDate submitted = (claim.getCreatedAt() != null ? claim.getCreatedAt() : LocalDateTime.now()).toLocalDate();
        BigDecimal amount = claim.getAmount();

        // 1. Treatment soon after the policy started (a classic sign of hiding a pre-existing illness)
        if (admitted != null && policy.policyStartDate() != null && !admitted.isBefore(policy.policyStartDate())) {
            long days = ChronoUnit.DAYS.between(policy.policyStartDate(), admitted);
            if (days < 30) {
                flags.add(new Flag("EARLY_CLAIM", "Soon after policy start", 30,
                        "Admitted " + days + " day" + (days == 1 ? "" : "s") + " after cover started"));
            } else if (days < 90) {
                flags.add(new Flag("EARLY_CLAIM", "Soon after policy start", 15,
                        "Admitted " + days + " days after cover started"));
            }
        }

        // 2. Bill far above the usual cost of this treatment
        BigDecimal typical = typicalCost(claim.getDiagnosisCode());
        if (typical != null && amount != null) {
            BigDecimal ratio = amount.divide(typical, 2, RoundingMode.HALF_UP);
            if (ratio.compareTo(new BigDecimal("3")) >= 0) {
                flags.add(new Flag("HIGH_FOR_TREATMENT", "Bill much higher than usual", 35,
                        ratio.stripTrailingZeros().toPlainString() + "× the usual " + inr(typical) + " for " + claim.getDiagnosisCode()));
            } else if (ratio.compareTo(new BigDecimal("2")) >= 0) {
                flags.add(new Flag("HIGH_FOR_TREATMENT", "Bill higher than usual", 20,
                        ratio.stripTrailingZeros().toPlainString() + "× the usual " + inr(typical) + " for " + claim.getDiagnosisCode()));
            }
        }

        List<Claim> others = otherClaims == null ? List.of() : otherClaims.stream()
                .filter(c -> c.getId() == null || !c.getId().equals(claim.getId()))
                .toList();

        // 3. Looks like a bill already claimed: same hospital and treatment, almost the same amount, within 30 days
        others.stream()
                .filter(c -> c.getStatus() != ClaimStatus.REJECTED)
                .filter(c -> same(c.getProviderId(), claim.getProviderId()) && same(c.getDiagnosisCode(), claim.getDiagnosisCode()))
                .filter(c -> c.getCreatedAt() != null && ChronoUnit.DAYS.between(c.getCreatedAt().toLocalDate(), submitted) <= 30)
                .filter(c -> close(c.getAmount(), amount))
                .findFirst()
                .ifPresent(c -> flags.add(new Flag("POSSIBLE_DUPLICATE", "Possible duplicate", 40,
                        "Very similar to " + label(c) + " (same hospital and treatment, " + inr(c.getAmount()) + ")")));

        // 4. Hospital stays that overlap with another claim (can't be in two hospitals at once)
        if (admitted != null && discharged != null) {
            others.stream()
                    .filter(c -> c.getStatus() != ClaimStatus.REJECTED)
                    .filter(c -> c.getAdmissionDate() != null && c.getDischargeDate() != null)
                    .filter(c -> !same(c.getProviderId(), claim.getProviderId()))
                    .filter(c -> !c.getAdmissionDate().isAfter(discharged) && !admitted.isAfter(c.getDischargeDate()))
                    .findFirst()
                    .ifPresent(c -> flags.add(new Flag("OVERLAPPING_STAY", "Overlapping hospital stay", 35,
                            "Dates overlap with " + label(c) + " at another hospital")));
        }

        // 5. Many claims in a short time
        long recent = others.stream()
                .filter(c -> c.getCreatedAt() != null && ChronoUnit.DAYS.between(c.getCreatedAt().toLocalDate(), submitted) <= 30)
                .count();
        if (recent >= 3) {
            flags.add(new Flag("FREQUENT_CLAIMS", "Many recent claims", 20, recent + " other claims in the last 30 days"));
        }

        // 6. Uses almost all of the remaining cover in one go
        BigDecimal remaining = policy.remaining();
        if (amount != null && remaining.signum() > 0
                && amount.compareTo(remaining.multiply(new BigDecimal("0.8"))) >= 0 && amount.compareTo(remaining) <= 0) {
            flags.add(new Flag("NEAR_LIMIT", "Uses most of the cover", 15,
                    "Claim is " + percent(amount, remaining) + " of the " + inr(remaining) + " cover left"));
        }

        // 7. Very high cost per day in hospital
        if (admitted != null && discharged != null && amount != null) {
            long nights = Math.max(1, ChronoUnit.DAYS.between(admitted, discharged));
            BigDecimal perDay = amount.divide(BigDecimal.valueOf(nights), 0, RoundingMode.HALF_UP);
            if (perDay.compareTo(new BigDecimal("150000")) > 0) {
                flags.add(new Flag("HIGH_DAILY_COST", "High cost per day", 15,
                        inr(perDay) + " per day over " + nights + " day" + (nights == 1 ? "" : "s")));
            }
        }

        // 8. Claimed long after discharge (reimbursement claims are usually filed within 30 days)
        if (discharged != null && ChronoUnit.DAYS.between(discharged, submitted) > 30) {
            flags.add(new Flag("LATE_SUBMISSION", "Filed late", 10,
                    "Submitted " + ChronoUnit.DAYS.between(discharged, submitted) + " days after discharge"));
        }

        // 9. Perfectly round large amount (bills rarely are)
        if (amount != null && amount.compareTo(new BigDecimal("50000")) >= 0
                && amount.remainder(new BigDecimal("50000")).signum() == 0) {
            flags.add(new Flag("ROUND_AMOUNT", "Round amount", 5, inr(amount) + " is an exact multiple of ₹50,000"));
        }

        int score = Math.min(100, flags.stream().mapToInt(Flag::getPoints).sum());
        flags.sort((a, b) -> Integer.compare(b.getPoints(), a.getPoints()));
        FraudAssessment result = new FraudAssessment();
        result.setScore(score);
        result.setLevel(score >= HIGH_FROM ? Level.HIGH : score >= MEDIUM_FROM ? Level.MEDIUM : Level.LOW);
        result.setFlags(flags);
        result.setAssessedAt(LocalDateTime.now());
        return result;
    }

    static BigDecimal typicalCost(String diagnosisCode) {
        if (diagnosisCode == null || diagnosisCode.length() < 3) return null;
        return TYPICAL_COST.get(diagnosisCode.substring(0, 3).toUpperCase(Locale.ROOT));
    }

    private static boolean same(String a, String b) {
        return a != null && a.equalsIgnoreCase(b);
    }

    /** Within 2% of each other. */
    private static boolean close(BigDecimal a, BigDecimal b) {
        if (a == null || b == null || b.signum() == 0) return false;
        return a.subtract(b).abs().divide(b, 4, RoundingMode.HALF_UP).compareTo(new BigDecimal("0.02")) <= 0;
    }

    private static String percent(BigDecimal part, BigDecimal whole) {
        return part.multiply(BigDecimal.valueOf(100)).divide(whole, 0, RoundingMode.HALF_UP) + "%";
    }

    private static String label(Claim c) {
        return c.getClaimNumber() != null ? c.getClaimNumber() : "an earlier claim";
    }

    /** ₹ with Indian digit grouping: 450000 → ₹4,50,000 */
    static String inr(BigDecimal value) {
        if (value == null) return "₹0";
        return "₹" + indianGrouping(value.setScale(0, RoundingMode.HALF_UP).toBigInteger().toString());
    }

    static String indianGrouping(String digits) {
        boolean negative = digits.startsWith("-");
        if (negative) digits = digits.substring(1);
        if (digits.length() <= 3) return (negative ? "-" : "") + digits;
        String last3 = digits.substring(digits.length() - 3);
        String rest = digits.substring(0, digits.length() - 3);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < rest.length(); i++) {
            if (i > 0 && (rest.length() - i) % 2 == 0) sb.append(',');
            sb.append(rest.charAt(i));
        }
        return (negative ? "-" : "") + sb + "," + last3;
    }
}
