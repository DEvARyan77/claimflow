package com.claimflow.payment.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "payments")
@Data
@NoArgsConstructor
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** unique: one claim is never paid twice, even if RabbitMQ delivers the message twice */
    @Column(nullable = false, unique = true)
    private Long claimId;

    @Column(nullable = false)
    private Long patientId;

    @Column(nullable = false)
    private Long providerId;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, unique = true)
    private String reference;        // e.g. PAY-7F3A91C2

    private LocalDateTime paidAt;

    @PrePersist
    void setDefaults() {
        paidAt = LocalDateTime.now();
    }
}
