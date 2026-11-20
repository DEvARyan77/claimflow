package com.claimflow.claims.dto;

import com.claimflow.claims.entity.ReviewNote.Action;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** An officer's decision: APPROVE, REJECT (needs a note), REQUEST_INFO (needs a note) or NOTE. */
public record ReviewRequest(@NotNull(message = "Choose an action") Action action, @Size(max = 1000) String note) {
}
