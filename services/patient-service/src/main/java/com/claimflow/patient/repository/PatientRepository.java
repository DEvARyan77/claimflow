package com.claimflow.patient.repository;

import com.claimflow.patient.entity.Patient;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface PatientRepository extends MongoRepository<Patient, String>, PatientRepositoryCustom {

    boolean existsByEmailOrPolicyNumber(String email, String policyNumber);
}
