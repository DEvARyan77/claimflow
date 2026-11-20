package com.claimflow.patient;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.TimeZone;

@SpringBootApplication
public class PatientServiceApplication {
    public static void main(String[] args) {
        // Windows reports India's zone as the old name "Asia/Calcutta", which PostgreSQL rejects.
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(PatientServiceApplication.class, args);
    }
}
