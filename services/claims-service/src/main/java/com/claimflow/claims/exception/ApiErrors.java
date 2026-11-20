package com.claimflow.claims.exception;

import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/** Every error goes back as {"message": "..."} so the app can show it as is. */
@RestControllerAdvice
public class ApiErrors {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .findFirst().map(f -> f.getDefaultMessage()).orElse("Check the form and try again");
        return ResponseEntity.badRequest().body(Map.of("message", message));
    }

    @ExceptionHandler({ClaimNotFoundException.class, InvalidClaimStateException.class, ForbiddenException.class,
            BadClaimRequestException.class, DependencyUnavailableException.class})
    public ResponseEntity<Map<String, String>> known(RuntimeException e) {
        ResponseStatus status = AnnotationUtils.findAnnotation(e.getClass(), ResponseStatus.class);
        HttpStatus code = status != null ? status.value() : HttpStatus.SERVICE_UNAVAILABLE;
        return ResponseEntity.status(code).body(Map.of("message", e.getMessage() == null ? "" : e.getMessage()));
    }
}
