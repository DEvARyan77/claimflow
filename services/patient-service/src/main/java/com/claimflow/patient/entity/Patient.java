package com.claimflow.patient.entity;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.math.BigDecimal;
import java.time.Instant;

/** A policyholder, stored in the "patients" collection of patient_db. */
@Document("patients")
@Data
@NoArgsConstructor
public class Patient {

    /** MongoDB ObjectId, sent to clients as a 24-character hex string. */
    @Id
    private String id;

    private String name;

    @Indexed(unique = true)
    private String email;

    private String phone;

    @Indexed(unique = true)
    private String policyNumber;

    private Boolean policyActive;

    /** Money is stored as Decimal128 (exact), never as a floating-point double. */
    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal coverageLimit;          // the most the insurance pays in a policy year

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal usedAmount;             // already used by approved claims

    private Instant createdAt;

    /** Shown in API responses as "remainingCoverage" (computed, not stored). */
    public BigDecimal getRemainingCoverage() {
        if (coverageLimit == null) {
            return BigDecimal.ZERO;
        }
        return coverageLimit.subtract(usedAmount == null ? BigDecimal.ZERO : usedAmount);
    }
}
