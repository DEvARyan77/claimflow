package com.claimflow.notification.entity;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

/** A message about a claim, stored in the "notifications" collection of notification_db. */
@Document("notifications")
@Data
@NoArgsConstructor
public class Notification {

    @Id
    private String id;

    @Indexed
    private String patientId;

    private String claimId;

    private String claimNumber;     // readable claim number, e.g. CLM-2026-000123

    private String claimStatus;     // the status this message is about: SUBMITTED / APPROVED / REJECTED / PAID

    private String channel;         // IN_APP or EMAIL

    private String message;

    private String deliveryStatus;  // SENT, FAILED, SKIPPED_NO_EMAIL (demo address) or NOT_SENT (email off)

    private String recipient;       // email address it was sent to

    private LocalDateTime sentAt;
}
