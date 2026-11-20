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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** A claim, stored in the "claims" collection of claims_db. */
@Document("claims")
@CompoundIndex(name = "status_createdAt", def = "{'status': 1, 'createdAt': 1}") // retry job + review queue
@CompoundIndex(name = "provider_createdAt", def = "{'providerId': 1, 'createdAt': -1}") // hospital's claims
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

    /** REIMBURSEMENT = policyholder paid and claims back; CASHLESS = hospital claims directly. */
    private ClaimType type;

    private String treatment;          // readable name of the diagnosis, e.g. "Heart attack"
    private LocalDate admissionDate;
    private LocalDate dischargeDate;

    // Who submitted it (from the gateway's X-User headers)
    private String submittedByUserId;
    private String submittedByRole;
    private String submittedByName;

    private FraudAssessment fraud;

    /** Officer decisions, requests for information and replies, oldest first. */
    private List<ReviewNote> reviewNotes = new ArrayList<>();

    /** Set while an officer's approval is being processed, so two officers can't approve it twice. */
    private Boolean reviewLock;

    private LocalDateTime createdAt;
    private LocalDateTime decidedAt;
    private LocalDateTime paidAt;
}
