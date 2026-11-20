package com.claimflow.claims.dto;

/** Sent by payment-service after paying the hospital. */
public record MarkPaidRequest(String paymentReference) {
}
