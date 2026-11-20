package com.claimflow.patient.service;

import com.claimflow.patient.dto.CreatePatientRequest;
import com.claimflow.patient.entity.Patient;
import com.claimflow.patient.exception.DuplicatePatientException;
import com.claimflow.patient.exception.InsufficientCoverageException;
import com.claimflow.patient.exception.PatientNotFoundException;
import com.claimflow.patient.repository.PatientRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PatientService {

    private final PatientRepository patientRepository;

    public Patient createPatient(CreatePatientRequest request) {
        if (patientRepository.existsByEmailOrPolicyNumber(request.email(), request.policyNumber())) {
            throw new DuplicatePatientException(request.email(), request.policyNumber());
        }
        Patient patient = new Patient();
        patient.setName(request.name());
        patient.setEmail(request.email());
        patient.setPhone(request.phone());
        patient.setPolicyNumber(request.policyNumber());
        patient.setCoverageLimit(request.coverageLimit());
        patient.setPolicyActive(request.policyActive() == null || request.policyActive());
        patient.setUsedAmount(BigDecimal.ZERO);
        patient.setCreatedAt(Instant.now());
        try {
            return patientRepository.save(patient);
        } catch (DuplicateKeyException e) {
            // Two requests raced past the check above; the unique index stops the second one.
            throw new DuplicatePatientException(request.email(), request.policyNumber());
        }
    }

    public Patient getPatient(String id) {
        return patientRepository.findById(id)
                .orElseThrow(() -> new PatientNotFoundException(id));
    }

    public List<Patient> getAllPatients() {
        return patientRepository.findAll();
    }

    /**
     * Called by the Claims service when a claim is approved.
     * One atomic conditional update (see PatientRepositoryCustomImpl): coverage can never go
     * negative, even when claims are approved in parallel.
     */
    public Patient addUsedAmount(String id, BigDecimal amount) {
        return patientRepository.reserveCoverage(id, amount).orElseThrow(() -> {
            // Nothing was updated: either the patient doesn't exist or the amount doesn't fit.
            Patient patient = getPatient(id);
            return new InsufficientCoverageException(patient.getRemainingCoverage());
        });
    }
}
