package com.claimflow.patient.repository;

import com.claimflow.patient.entity.Patient;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PatientRepository extends JpaRepository<Patient, Long> {

    boolean existsByEmailOrPolicyNumber(String email, String policyNumber);

    /**
     * Locks the patient's row until the transaction ends, so two claims approved at the
     * same moment can't both use the same remaining coverage.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Patient p where p.id = :id")
    Optional<Patient> findByIdForUpdate(@Param("id") Long id);
}
