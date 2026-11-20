package com.claimflow.patient.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "patients")
@Data
@NoArgsConstructor
public class Patient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    private String phone;

    @Column(nullable = false, unique = true)
    private String policyNumber;

    private Boolean policyActive;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal coverageLimit;          // the most the insurance pays in a policy year

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal usedAmount;             // already used by approved claims

    private LocalDateTime createdAt;

    /** Shown in API responses as "remainingCoverage" (computed, not stored). */
    public BigDecimal getRemainingCoverage() {
        if (coverageLimit == null) {
            return BigDecimal.ZERO;
        }
        return coverageLimit.subtract(usedAmount == null ? BigDecimal.ZERO : usedAmount);
    }

    @PrePersist
    void setDefaults() {
        if (policyActive == null) policyActive = true;
        if (usedAmount == null) usedAmount = BigDecimal.ZERO;
        createdAt = LocalDateTime.now();
    }
}
