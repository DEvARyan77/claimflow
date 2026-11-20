package com.claimflow.notification.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/** The policyholder's login account: its email and the alternate email that gets a copy. */
@FeignClient(name = "auth-service")
public interface AuthClient {

    @GetMapping("/auth/internal/patients/{patientId}/account")
    Account accountForPatient(@PathVariable("patientId") String patientId);

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Account(String email, String alternateEmail, String name) {
    }
}
