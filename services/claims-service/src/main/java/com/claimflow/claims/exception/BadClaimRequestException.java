package com.claimflow.claims.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.BAD_REQUEST)
public class BadClaimRequestException extends RuntimeException {
    public BadClaimRequestException(String message) {
        super(message);
    }
}
