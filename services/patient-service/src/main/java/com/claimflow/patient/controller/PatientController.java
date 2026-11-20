package com.claimflow.patient.controller;

import com.claimflow.patient.dto.CreatePatientRequest;
import com.claimflow.patient.dto.EnrolRequest;
import com.claimflow.patient.dto.ProfileRequest;
import com.claimflow.patient.dto.UsedAmountRequest;
import com.claimflow.patient.entity.Patient;
import com.claimflow.patient.service.PatientService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/patients")
@RequiredArgsConstructor
public class PatientController {

    private final PatientService patientService;

    @GetMapping
    public List<Patient> getAll() {
        return patientService.getAllPatients();
    }

    @GetMapping("/{id}")
    public Patient getById(@PathVariable String id) {
        return patientService.getPatient(id);
    }

    @PostMapping
    public ResponseEntity<Patient> create(@Valid @RequestBody CreatePatientRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(patientService.createPatient(request));
    }

    /** Hospitals look a patient up by policy number for a cashless claim; auth-service uses it at sign-up. */
    @GetMapping("/by-policy/{policyNumber}")
    public Patient getByPolicy(@PathVariable String policyNumber) {
        return patientService.getByPolicyNumber(policyNumber);
    }

    /** Internal: auth-service issues a demo policy to someone who signs up without one. */
    @PostMapping("/enrol")
    public ResponseEntity<Patient> enrol(@Valid @RequestBody EnrolRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(patientService.enrol(request));
    }

    /** The policyholder edits their own details (the gateway only allows their own id). */
    @PatchMapping("/{id}/profile")
    public Patient updateProfile(@PathVariable String id, @Valid @RequestBody ProfileRequest request) {
        return patientService.updateProfile(id, request);
    }

    /** Internal: used by claims-service after approving a claim. */
    @PostMapping("/{id}/used-amount")
    public Patient addUsedAmount(@PathVariable String id, @Valid @RequestBody UsedAmountRequest request) {
        return patientService.addUsedAmount(id, request.amount());
    }
}
