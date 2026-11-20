package com.claimflow.patient.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.math.BigDecimal;

/** 409: the claim amount is more than the coverage left (checked again here, inside a row lock). */
@ResponseStatus(HttpStatus.CONFLICT)
public class InsufficientCoverageException extends RuntimeException {
    public InsufficientCoverageException(BigDecimal remaining) {
        super("Coverage limit exceeded. Remaining coverage: " + remaining);
    }
}
