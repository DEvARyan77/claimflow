package com.claimflow.patient;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.TimeZone;

@SpringBootApplication
public class PatientServiceApplication {
    public static void main(String[] args) {
        // Show dates in India time in logs and responses.
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(PatientServiceApplication.class, args);
    }
}
