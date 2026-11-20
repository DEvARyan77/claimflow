package com.claimflow.events;

/**
 * Names of the RabbitMQ exchange, routing keys and queues, shared by every service.
 *
 * claims.exchange (topic)
 *   claim.submitted / claim.approved / claim.rejected / claim.paid
 *     -> notification.queue  (binding "claim.*": every status change)
 *     -> payment.queue       (binding "claim.approved": only approved claims get paid)
 *
 * account.exchange (topic)
 *   account.welcome / account.staff_created / account.password_reset / account.password_changed
 *     -> account-notification.queue (binding "account.*")
 */
public final class Messaging {

    public static final String EXCHANGE = "claims.exchange";

    public static final String NOTIFICATION_QUEUE = "notification.queue";
    public static final String PAYMENT_QUEUE = "payment.queue";

    public static final String ALL_CLAIM_EVENTS = "claim.*";
    public static final String CLAIM_APPROVED = "claim.approved";

    public static final String ACCOUNT_EXCHANGE = "account.exchange";
    public static final String ACCOUNT_NOTIFICATION_QUEUE = "account-notification.queue";
    public static final String ALL_ACCOUNT_EVENTS = "account.*";

    private Messaging() {
    }

    /** e.g. APPROVED -> "claim.approved" */
    public static String routingKeyFor(String status) {
        return "claim." + status.toLowerCase();
    }
}
