package com.claimflow.claims.service;

import com.claimflow.claims.client.PatientDto;
import com.claimflow.claims.client.ProviderDto;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class ClaimRulesTest {

    private static PatientDto patient(boolean active, String limit, String used) {
        PatientDto p = new PatientDto();
        p.setId("64b7f0c2a1b2c3d4e5f60718");
        p.setName("Rahul Sharma");
        p.setPolicyActive(active);
        p.setCoverageLimit(new BigDecimal(limit));
        p.setUsedAmount(new BigDecimal(used));
        return p;
    }

    private static ProviderDto provider(boolean inNetwork) {
        ProviderDto p = new ProviderDto();
        p.setId("64b7f0c2a1b2c3d4e5f60718");
        p.setName("Apollo Hospital");
        p.setInNetwork(inNetwork);
        return p;
    }

    @Test
    void approvesWhenEveryRulePasses() {
        assertThat(ClaimRules.findRejectionReason(patient(true, "500000", "0"), provider(true), new BigDecimal("50000")))
                .isEmpty();
    }

    @Test
    void approvesWhenAmountEqualsRemainingCoverage() {
        assertThat(ClaimRules.findRejectionReason(patient(true, "500000", "450000"), provider(true), new BigDecimal("50000")))
                .isEmpty();
    }

    @Test
    void rejectsUnknownPatient() {
        assertThat(ClaimRules.findRejectionReason(null, provider(true), BigDecimal.TEN))
                .contains("Patient not found");
    }

    @Test
    void rejectsInactivePolicy() {
        assertThat(ClaimRules.findRejectionReason(patient(false, "500000", "0"), provider(true), BigDecimal.TEN))
                .contains("Policy is inactive");
    }

    @Test
    void rejectsUnknownHospital() {
        assertThat(ClaimRules.findRejectionReason(patient(true, "500000", "0"), null, BigDecimal.TEN))
                .contains("Hospital not found");
    }

    @Test
    void rejectsOutOfNetworkHospital() {
        assertThat(ClaimRules.findRejectionReason(patient(true, "500000", "0"), provider(false), BigDecimal.TEN))
                .contains("Apollo Hospital is out of network");
    }

    @Test
    void rejectsWhenAmountIsMoreThanRemainingCoverage() {
        assertThat(ClaimRules.findRejectionReason(patient(true, "500000", "450000"), provider(true), new BigDecimal("50001")))
                .hasValueSatisfying(reason -> assertThat(reason).startsWith("Coverage limit exceeded"));
    }
}
