package com.claimflow.provider.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.NOT_FOUND)
public class ProviderNotFoundException extends RuntimeException {
    public ProviderNotFoundException(String id) {
        super("Provider not found with id: " + id);
    }
}
