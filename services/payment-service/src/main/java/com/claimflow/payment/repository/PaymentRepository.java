package com.claimflow.payment.repository;

import com.claimflow.payment.entity.Payment;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends MongoRepository<Payment, String> {

    Optional<Payment> findByClaimId(String claimId);

    List<Payment> findByPatientIdOrderByPaidAtDesc(String patientId);

    List<Payment> findByProviderIdOrderByPaidAtDesc(String providerId);

    List<Payment> findAllByOrderByPaidAtDesc();
}
