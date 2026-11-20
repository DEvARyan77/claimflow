package com.claimflow.claims.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "claims")
@Data
@NoArgsConstructor
public class Claim {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Only IDs: patient and hospital data belong to other services (database-per-service)
    @Column(nullable = false)
    private Long patientId;

    @Column(nullable = false)
    private Long providerId;

    @Column(nullable = false)
    private String diagnosisCode;      // ICD-10 code, e.g. I21 = heart attack

    private String description;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ClaimStatus status;

    private String reason;             // why it was rejected / why it is still pending

    private String paymentReference;

    private String extraEmail;         // optional: a second address that also gets every update

    private LocalDateTime createdAt;
    private LocalDateTime decidedAt;
    private LocalDateTime paidAt;

    @PrePersist
    void setDefaults() {
        if (status == null) status = ClaimStatus.SUBMITTED;
        createdAt = LocalDateTime.now();
    }
}
