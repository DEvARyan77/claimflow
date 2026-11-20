package com.claimflow.patient.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

/** Sent by the Claims service when a claim is approved: { "amount": 5000 } */
public record UsedAmountRequest(@NotNull @Positive BigDecimal amount) {
}
