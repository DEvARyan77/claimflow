package com.claimflow.claims.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** policy-assistant-service owns the AI (Gemini) client, so it writes the fraud review. */
@FeignClient(name = "policy-assistant-service", contextId = "fraudReview")
public interface FraudReviewClient {

    @PostMapping("/policies/fraud-review")
    Review review(@RequestBody Request request);

    record FlagView(String label, String detail, int points) {
    }

    record Request(String claimNumber, String claimType, String diagnosisCode, String treatment, BigDecimal amount,
                   BigDecimal typicalCost, LocalDate admissionDate, LocalDate dischargeDate, LocalDate policyStartDate,
                   BigDecimal coverLeft, int score, String level, List<FlagView> flags) {
    }

    /** status: DONE, or OFF when no AI key is set. recommendation: APPROVE / INVESTIGATE / REJECT. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Review(String status, String summary, String recommendation) {
    }
}
