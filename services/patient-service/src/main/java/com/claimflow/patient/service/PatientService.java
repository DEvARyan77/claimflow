package com.claimflow.patient.service;

import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import com.claimflow.patient.dto.CreatePatientRequest;
import com.claimflow.patient.dto.EnrolRequest;
import com.claimflow.patient.dto.ProfileRequest;
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
import java.time.LocalDate;
import java.util.concurrent.ThreadLocalRandom;
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
        patient.setPolicyStartDate(request.policyStartDate() != null ? request.policyStartDate() : LocalDate.now());
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

    public Patient getByPolicyNumber(String policyNumber) {
        return patientRepository.findByPolicyNumberIgnoreCase(policyNumber.trim())
                .orElseThrow(() -> new PatientNotFoundException("policy " + policyNumber));
    }

    /**
     * A new policyholder signs up without an existing policy: issue a demo policy
     * (₹5,00,000 cover, starting today) with a fresh policy number.
     */
    public Patient enrol(EnrolRequest request) {
        if (request.policyNumber() != null && !request.policyNumber().isBlank()) {
            // createPatient answers 409 if this number (or email) is already used
            return createPatient(new CreatePatientRequest(request.name(), request.email(), request.phone(),
                    request.policyNumber().trim().toUpperCase(),
                    request.coverageLimit() != null ? request.coverageLimit() : new BigDecimal("500000"), true, LocalDate.now()));
        }
        for (int attempt = 0; attempt < 5; attempt++) {
            String number = "POL" + ThreadLocalRandom.current().nextInt(200000, 999999);
            if (patientRepository.existsByEmailOrPolicyNumber("", number)) continue;
            return createPatient(new CreatePatientRequest(request.name(), request.email(), request.phone(), number,
                    new BigDecimal("500000"), true, LocalDate.now()));
        }
        throw new IllegalStateException("Couldn't issue a policy number, please try again");
    }

    public Patient updateProfile(String id, ProfileRequest request) {
        Patient patient = getPatient(id);
        // Name and gender are policy (KYC) details: the name never changes here, and gender can only be
        // filled in once if the policy didn't have it. Contact details can always be updated.
        if (request.name() != null && !request.name().isBlank() && !request.name().trim().equals(patient.getName())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your name comes from your policy and can't be changed here");
        }
        String gender = blankToNull(request.gender());
        if (gender != null && patient.getGender() != null && !gender.equals(patient.getGender())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gender is recorded on your policy and can't be changed here");
        }
        if (patient.getGender() == null) patient.setGender(gender);
        patient.setPhone(blankToNull(request.phone()));
        patient.setAddress(blankToNull(request.address()));
        patient.setDateOfBirth(request.dateOfBirth());
        return patientRepository.save(patient);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
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
