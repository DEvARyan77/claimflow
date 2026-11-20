package com.claimflow.payment.repository;

import com.claimflow.payment.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByClaimId(Long claimId);

    List<Payment> findByPatientIdOrderByPaidAtDesc(Long patientId);

    List<Payment> findAllByOrderByPaidAtDesc();
}
