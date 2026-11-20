package com.claimflow.patient.config;

import com.claimflow.patient.dto.CreatePatientRequest;
import com.claimflow.patient.repository.PatientRepository;
import com.claimflow.patient.service.PatientService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/** Adds demo patients the first time the service starts (only when the table is empty). */
@Slf4j
@Component
@RequiredArgsConstructor
public class DemoDataSeeder implements CommandLineRunner {

    private final PatientRepository patientRepository;
    private final PatientService patientService;

    @Override
    public void run(String... args) {
        if (patientRepository.count() > 0) {
            return;
        }
        patientService.createPatient(new CreatePatientRequest(
                "Rahul Sharma", "rahul.sharma@example.com", "+91 98100 00001", "POL1001",
                new BigDecimal("500000"), true));
        patientService.createPatient(new CreatePatientRequest(
                "Priya Nair", "priya.nair@example.com", "+91 98100 00002", "POL1002",
                new BigDecimal("300000"), true));
        patientService.createPatient(new CreatePatientRequest(
                "Amit Verma", "amit.verma@example.com", "+91 98100 00003", "POL1003",
                new BigDecimal("200000"), false));
        log.info("Seeded 3 demo patients (Amit's policy is inactive on purpose)");
    }
}
