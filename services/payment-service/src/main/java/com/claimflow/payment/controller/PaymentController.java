package com.claimflow.payment.controller;

import com.claimflow.payment.entity.Payment;
import com.claimflow.payment.repository.PaymentRepository;
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

    @GetMapping("/claim/{claimId}")
    public Payment getByClaim(@PathVariable String claimId) {
        return paymentRepository.findByClaimId(claimId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No payment yet for claim " + claimId));
    }

    @GetMapping("/patient/{patientId}")
    public List<Payment> getByPatient(@PathVariable String patientId) {
        return paymentRepository.findByPatientIdOrderByPaidAtDesc(patientId);
    }
}
