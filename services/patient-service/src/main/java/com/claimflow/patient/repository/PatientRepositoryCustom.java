package com.claimflow.patient.repository;

import com.claimflow.patient.entity.Patient;

import java.math.BigDecimal;
import java.util.Optional;

public interface PatientRepositoryCustom {

    /**
     * Adds {@code amount} to the patient's used coverage only if it still fits under the limit,
     * as ONE atomic database operation. Returns the updated patient, or empty when the patient
     * doesn't exist or the amount doesn't fit.
     */
    Optional<Patient> reserveCoverage(String id, BigDecimal amount);
}
