package com.claimflow.patient.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
public class DuplicatePatientException extends RuntimeException {
    public DuplicatePatientException(String email, String policyNumber) {
        super("A patient with email " + email + " or policy " + policyNumber + " already exists");
    }
}
