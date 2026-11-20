package com.claimflow.claims.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/** The few patient fields the claims rules need (extra fields in the JSON are ignored). */
@Data
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PatientDto {
    private Long id;
    private String name;
    private Boolean policyActive;
    private BigDecimal coverageLimit;
    private BigDecimal usedAmount;
}
