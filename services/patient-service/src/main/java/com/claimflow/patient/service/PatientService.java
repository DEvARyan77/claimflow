package com.claimflow.patient.service;

import com.claimflow.patient.dto.CreatePatientRequest;
import com.claimflow.patient.entity.Patient;
import com.claimflow.patient.exception.DuplicatePatientException;
import com.claimflow.patient.exception.InsufficientCoverageException;
import com.claimflow.patient.exception.PatientNotFoundException;
import com.claimflow.patient.repository.PatientRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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
        patient.setPolicyActive(request.policyActive());
        return patientRepository.save(patient);
    }

    public Patient getPatient(Long id) {
        return patientRepository.findById(id)
                .orElseThrow(() -> new PatientNotFoundException(id));
    }

    public List<Patient> getAllPatients() {
        return patientRepository.findAll();
    }

    /**
     * Called by the Claims service when a claim is approved.
     * The row lock + re-check means coverage can never go negative, even with parallel claims.
     */
    @Transactional
    public Patient addUsedAmount(Long id, BigDecimal amount) {
        Patient patient = patientRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new PatientNotFoundException(id));

        if (amount.compareTo(patient.getRemainingCoverage()) > 0) {
            throw new InsufficientCoverageException(patient.getRemainingCoverage());
        }
        patient.setUsedAmount(patient.getUsedAmount().add(amount));
        return patientRepository.save(patient);
    }
}
