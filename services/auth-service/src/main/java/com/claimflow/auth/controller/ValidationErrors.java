package com.claimflow.auth.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/** Turns a failed @Valid into { "message": "Use at least 8 characters" } so the app can show it as is. */
@RestControllerAdvice
public class ValidationErrors {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(f -> f.getDefaultMessage() != null && !f.getDefaultMessage().startsWith("must")
                        ? f.getDefaultMessage()
                        : humanField(f.getField()) + " " + f.getDefaultMessage())
                .orElse("Please check the form");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", message));
    }

    private static String humanField(String field) {
        String spaced = field.replaceAll("([A-Z])", " $1").toLowerCase();
        return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }
}
