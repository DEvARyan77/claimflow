package com.claimflow.notification.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "notifications")
@Data
@NoArgsConstructor
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long patientId;

    @Column(nullable = false)
    private Long claimId;

    @Column(nullable = false)
    private String claimStatus;     // the status this message is about: SUBMITTED / APPROVED / REJECTED / PAID

    @Column(nullable = false)
    private String channel;         // IN_APP or EMAIL

    @Column(nullable = false, length = 500)
    private String message;

    private String deliveryStatus;  // SENT, FAILED, SKIPPED_NO_EMAIL (demo address) or NOT_SENT (email off)

    private String recipient;       // email address it was sent to

    private LocalDateTime sentAt;

    @PrePersist
    void setDefaults() {
        sentAt = LocalDateTime.now();
    }
}
