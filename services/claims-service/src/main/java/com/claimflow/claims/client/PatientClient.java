package com.claimflow.claims.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/** Feign writes the HTTP code. "patient-service" is looked up in Eureka (no hardcoded host/port). */
@FeignClient(name = "patient-service")
public interface PatientClient {

    @GetMapping("/patients/{id}")
    PatientDto getPatient(@PathVariable("id") String id);

    @PostMapping("/patients/{id}/used-amount")
    PatientDto addUsedAmount(@PathVariable("id") String id, @RequestBody UsedAmountRequest request);
}
