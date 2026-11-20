package com.claimflow.claims.repository;

import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.ClaimStatus;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface ClaimRepository extends MongoRepository<Claim, String>, ClaimRepositoryCustom {

    List<Claim> findByPatientIdOrderByCreatedAtDesc(String patientId);

    List<Claim> findAllByOrderByCreatedAtDesc();

    List<Claim> findByStatusAndCreatedAtBefore(ClaimStatus status, LocalDateTime before);
}
