package com.claimflow.events;

/**
 * Sent by auth-service on account.exchange; notification-service turns it into an email.
 *
 * type: WELCOME, STAFF_CREATED, PASSWORD_RESET (link = the reset page), PASSWORD_CHANGED
 */
public record AccountEvent(
        String type,
        String email,
        String alternateEmail,   // gets a copy, when the user set one
        String name,
        String role,
        String link
) {
}
