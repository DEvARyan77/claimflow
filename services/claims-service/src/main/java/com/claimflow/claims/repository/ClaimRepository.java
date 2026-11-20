package com.claimflow.claims.repository;

import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.ClaimStatus;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface ClaimRepository extends MongoRepository<Claim, String>, ClaimRepositoryCustom {

    List<Claim> findByPatientIdOrderByCreatedAtDesc(String patientId);

    List<Claim> findByProviderIdOrderByCreatedAtDesc(String providerId);

    List<Claim> findAllByOrderByCreatedAtDesc();

    List<Claim> findByStatusAndCreatedAtBefore(ClaimStatus status, LocalDateTime before);

    /** The policyholder's recent claims, for the fraud check. */
    List<Claim> findByPatientIdAndCreatedAtAfter(String patientId, LocalDateTime after);

    /** Review queue. */
    List<Claim> findByStatusIn(Collection<ClaimStatus> statuses, Sort sort);
}
