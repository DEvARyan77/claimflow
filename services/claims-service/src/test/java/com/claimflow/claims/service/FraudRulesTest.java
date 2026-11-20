package com.claimflow.claims.service;

import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.ClaimStatus;
import com.claimflow.claims.entity.FraudAssessment;
import com.claimflow.claims.entity.FraudAssessment.Level;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FraudRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 21);
    private static final FraudRules.PolicyFacts OLD_POLICY =
            new FraudRules.PolicyFacts(TODAY.minusYears(2), new BigDecimal("500000"), BigDecimal.ZERO);

    private static Claim claim(String id, String provider, String icd, String amount, LocalDate in, LocalDate out, LocalDate filed) {
        Claim c = new Claim();
        c.setId(id);
        c.setClaimNumber("CLM-2026-" + id);
        c.setPatientId("p1");
        c.setProviderId(provider);
        c.setDiagnosisCode(icd);
        c.setAmount(new BigDecimal(amount));
        c.setAdmissionDate(in);
        c.setDischargeDate(out);
        c.setCreatedAt(filed.atTime(10, 0));
        c.setStatus(ClaimStatus.APPROVED);
        return c;
    }

    private static List<String> codes(FraudAssessment a) {
        return a.getFlags().stream().map(FraudAssessment.Flag::getCode).toList();
    }

    @Test
    void ordinaryClaimIsLowRiskWithNoFlags() {
        Claim c = claim("1", "h1", "J18.9", "72350", TODAY.minusDays(6), TODAY.minusDays(2), TODAY);
        FraudAssessment a = FraudRules.assess(c, OLD_POLICY, List.of());
        assertThat(a.getScore()).isZero();
        assertThat(a.getLevel()).isEqualTo(Level.LOW);
        assertThat(a.getFlags()).isEmpty();
    }

    @Test
    void claimDaysAfterPolicyStartIsFlagged() {
        var newPolicy = new FraudRules.PolicyFacts(TODAY.minusDays(20), new BigDecimal("500000"), BigDecimal.ZERO);
        Claim c = claim("1", "h1", "J18.9", "72350", TODAY.minusDays(8), TODAY.minusDays(3), TODAY);
        FraudAssessment a = FraudRules.assess(c, newPolicy, List.of());
        assertThat(codes(a)).containsExactly("EARLY_CLAIM");
        assertThat(a.getScore()).isEqualTo(30);
        assertThat(a.getLevel()).isEqualTo(Level.MEDIUM);
        assertThat(a.getFlags().getFirst().getDetail()).isEqualTo("Admitted 12 days after cover started");
    }

    @Test
    void billFarAboveTypicalCostIsFlagged() {
        // pneumonia usually ₹80,000; ₹2,60,000 is 3.25×
        Claim c = claim("1", "h1", "J18.9", "260000", TODAY.minusDays(6), TODAY.minusDays(2), TODAY);
        FraudAssessment a = FraudRules.assess(c, OLD_POLICY, List.of());
        assertThat(codes(a)).contains("HIGH_FOR_TREATMENT");
        assertThat(a.getFlags().getFirst().getPoints()).isEqualTo(35);
        assertThat(a.getFlags().getFirst().getDetail()).contains("₹80,000").contains("J18.9");
    }

    @Test
    void sameBillClaimedTwiceIsAPossibleDuplicate() {
        Claim earlier = claim("1", "h1", "K35.8", "118000", TODAY.minusDays(14), TODAY.minusDays(11), TODAY.minusDays(10));
        Claim again = claim("2", "h1", "K35.8", "118500", TODAY.minusDays(14), TODAY.minusDays(11), TODAY);
        FraudAssessment a = FraudRules.assess(again, OLD_POLICY, List.of(earlier));
        assertThat(codes(a)).contains("POSSIBLE_DUPLICATE");
        assertThat(a.getLevel()).isEqualTo(Level.MEDIUM);
    }

    @Test
    void rejectedEarlierClaimDoesNotCountAsDuplicate() {
        Claim earlier = claim("1", "h1", "K35.8", "118000", TODAY.minusDays(14), TODAY.minusDays(11), TODAY.minusDays(10));
        earlier.setStatus(ClaimStatus.REJECTED);
        Claim again = claim("2", "h1", "K35.8", "118000", TODAY.minusDays(14), TODAY.minusDays(11), TODAY);
        assertThat(codes(FraudRules.assess(again, OLD_POLICY, List.of(earlier)))).doesNotContain("POSSIBLE_DUPLICATE");
    }

    @Test
    void overlappingStaysAtTwoHospitalsAreFlagged() {
        Claim other = claim("1", "h2", "A90", "40000", TODAY.minusDays(10), TODAY.minusDays(5), TODAY.minusDays(4));
        Claim c = claim("2", "h1", "J18.9", "70000", TODAY.minusDays(7), TODAY.minusDays(2), TODAY);
        assertThat(codes(FraudRules.assess(c, OLD_POLICY, List.of(other)))).contains("OVERLAPPING_STAY");
    }

    @Test
    void manyClaimsInAMonthNearlyAllCoverAndHighDailyCostAddUp() {
        var policy = new FraudRules.PolicyFacts(TODAY.minusYears(1), new BigDecimal("500000"), new BigDecimal("300000"));
        List<Claim> recent = List.of(
                claim("a", "h2", "A01", "30000", TODAY.minusDays(28), TODAY.minusDays(26), TODAY.minusDays(25)),
                claim("b", "h3", "A90", "35000", TODAY.minusDays(20), TODAY.minusDays(18), TODAY.minusDays(17)),
                claim("c", "h2", "N20", "45000", TODAY.minusDays(12), TODAY.minusDays(11), TODAY.minusDays(10)));
        Claim c = claim("d", "h1", "S72", "185000", TODAY.minusDays(2), TODAY.minusDays(1), TODAY);
        FraudAssessment a = FraudRules.assess(c, policy, recent);
        assertThat(codes(a)).contains("FREQUENT_CLAIMS", "NEAR_LIMIT", "HIGH_DAILY_COST");
        assertThat(a.getScore()).isEqualTo(50);
    }

    @Test
    void roundAmountAndLateFilingAreSmallSignals() {
        Claim c = claim("1", "h1", "Z00", "100000", TODAY.minusDays(60), TODAY.minusDays(55), TODAY);
        FraudAssessment a = FraudRules.assess(c, OLD_POLICY, List.of());
        assertThat(codes(a)).containsExactly("LATE_SUBMISSION", "ROUND_AMOUNT");
        assertThat(a.getLevel()).isEqualTo(Level.LOW);
    }

    @Test
    void manyFlagsTogetherAreHighRiskAndCappedAt100() {
        var newPolicy = new FraudRules.PolicyFacts(TODAY.minusDays(10), new BigDecimal("500000"), BigDecimal.ZERO);
        Claim earlier = claim("1", "h1", "H25.9", "400000", TODAY.minusDays(5), TODAY.minusDays(4), TODAY.minusDays(3));
        Claim c = claim("2", "h1", "H25.9", "400000", TODAY.minusDays(5), TODAY.minusDays(4), TODAY);
        FraudAssessment a = FraudRules.assess(c, newPolicy, List.of(earlier));
        assertThat(a.getLevel()).isEqualTo(Level.HIGH);
        assertThat(a.getScore()).isEqualTo(100);
        // biggest flags first
        assertThat(a.getFlags().getFirst().getPoints()).isGreaterThanOrEqualTo(a.getFlags().getLast().getPoints());
    }

    @Test
    void indianDigitGrouping() {
        assertThat(FraudRules.inr(new BigDecimal("450000"))).isEqualTo("₹4,50,000");
        assertThat(FraudRules.inr(new BigDecimal("12345678.6"))).isEqualTo("₹1,23,45,679");
        assertThat(FraudRules.inr(new BigDecimal("999"))).isEqualTo("₹999");
        assertThat(FraudRules.inr(new BigDecimal("1000"))).isEqualTo("₹1,000");
    }
}
