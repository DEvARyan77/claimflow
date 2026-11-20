package com.claimflow.payment.entity;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A payout to a hospital, stored in the "payments" collection of payment_db. */
@Document("payments")
@Data
@NoArgsConstructor
public class Payment {

    @Id
    private String id;

    /** Unique index: one claim is never paid twice, even if RabbitMQ delivers the message twice. */
    @Indexed(unique = true)
    private String claimId;

    private String claimNumber;      // readable claim number, e.g. CLM-2026-000123

    @Indexed
    private String patientId;

    private String providerId;

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal amount;

    @Indexed(unique = true)
    private String reference;        // e.g. PAY-7F3A91C2

    private LocalDateTime paidAt;
}
