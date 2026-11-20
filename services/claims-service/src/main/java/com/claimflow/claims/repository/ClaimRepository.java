package com.claimflow.claims.repository;

import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.ClaimStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface ClaimRepository extends JpaRepository<Claim, Long> {

    List<Claim> findByPatientIdOrderByCreatedAtDesc(Long patientId);

    List<Claim> findAllByOrderByCreatedAtDesc();

    List<Claim> findByStatusAndCreatedAtBefore(ClaimStatus status, LocalDateTime before);
}
