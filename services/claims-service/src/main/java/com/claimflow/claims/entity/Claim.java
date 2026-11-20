package com.claimflow.claims.entity;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A claim, stored in the "claims" collection of claims_db. */
@Document("claims")
@CompoundIndex(name = "status_createdAt", def = "{'status': 1, 'createdAt': 1}") // retry job: SUBMITTED + older than
@Data
@NoArgsConstructor
public class Claim {

    @Id
    private String id;

    /** Readable number shown to people, e.g. CLM-2026-000123 (the id is a 24-character ObjectId). */
    @Indexed(unique = true)
    private String claimNumber;

    // Only IDs: patient and hospital data belong to other services (database-per-service)
    @Indexed
    private String patientId;

    private String providerId;

    private String diagnosisCode;      // ICD-10 code, e.g. I21 = heart attack

    private String description;

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal amount;

    private ClaimStatus status;        // stored as its name, e.g. "APPROVED"

    private String reason;             // why it was rejected / why it is still pending

    private String paymentReference;

    private String extraEmail;         // optional: a second address that also gets every update

    private LocalDateTime createdAt;
    private LocalDateTime decidedAt;
    private LocalDateTime paidAt;
}
