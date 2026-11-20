package com.claimflow.payment.controller;

import com.claimflow.payment.entity.Payment;
import com.claimflow.payment.repository.PaymentRepository;
import com.claimflow.security.Roles;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentRepository paymentRepository;

    @GetMapping
    public List<Payment> getAll() {
        return paymentRepository.findAllByOrderByPaidAtDesc();
    }

    /** A policyholder sees only their own payments, a hospital only its own (headers set by the gateway). */
    @GetMapping("/claim/{claimId}")
    public Payment getByClaim(@PathVariable String claimId,
                              @RequestHeader(value = Roles.HEADER_ROLE, required = false) String role,
                              @RequestHeader(value = Roles.HEADER_PATIENT_ID, required = false) String patientId,
                              @RequestHeader(value = Roles.HEADER_PROVIDER_ID, required = false) String providerId) {
        return paymentRepository.findByClaimId(claimId)
                .filter(p -> !Roles.POLICYHOLDER.equals(role) || p.getPatientId().equals(patientId))
                .filter(p -> !Roles.HOSPITAL.equals(role) || p.getProviderId().equals(providerId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No payment yet for this claim"));
    }

    @GetMapping("/provider/{providerId}")
    public List<Payment> getByProvider(@PathVariable String providerId) {
        return paymentRepository.findByProviderIdOrderByPaidAtDesc(providerId);
    }

    @GetMapping("/patient/{patientId}")
    public List<Payment> getByPatient(@PathVariable String patientId) {
        return paymentRepository.findByPatientIdOrderByPaidAtDesc(patientId);
    }
}
