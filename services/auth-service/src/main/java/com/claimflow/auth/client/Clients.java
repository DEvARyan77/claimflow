package com.claimflow.auth.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/** Calls to the services that own policies and hospitals (found through Eureka). */
public final class Clients {

    private Clients() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PatientRef(String id, String name, String email, String policyNumber) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ProviderRef(String id, String name, String registrationNumber) {
    }

    public record EnrolRequest(String name, String email, String phone) {
    }

    @FeignClient(name = "patient-service")
    public interface PatientClient {
        @GetMapping("/patients/by-policy/{policyNumber}")
        PatientRef byPolicy(@PathVariable("policyNumber") String policyNumber);

        @PostMapping("/patients/enrol")
        PatientRef enrol(@RequestBody EnrolRequest request);
    }

    @FeignClient(name = "provider-service")
    public interface ProviderClient {
        @GetMapping("/providers/{id}")
        ProviderRef byId(@PathVariable("id") String id);

        @GetMapping("/providers/by-registration/{registrationNumber}")
        ProviderRef byRegistration(@PathVariable("registrationNumber") String registrationNumber);
    }
}
