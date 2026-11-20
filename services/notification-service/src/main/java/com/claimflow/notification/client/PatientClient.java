package com.claimflow.notification.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/** Asks patient-service (found through Eureka) for the patient's name and email. */
@FeignClient(name = "patient-service")
public interface PatientClient {

    @GetMapping("/patients/{id}")
    PatientContact getPatient(@PathVariable("id") String id);

    @JsonIgnoreProperties(ignoreUnknown = true)
    record PatientContact(String id, String name, String email) {
    }
}
