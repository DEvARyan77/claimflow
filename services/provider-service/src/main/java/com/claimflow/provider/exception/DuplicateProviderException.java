package com.claimflow.provider.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
public class DuplicateProviderException extends RuntimeException {
    public DuplicateProviderException(String registrationNumber) {
        super("Provider already exists with registration number: " + registrationNumber);
    }
}
