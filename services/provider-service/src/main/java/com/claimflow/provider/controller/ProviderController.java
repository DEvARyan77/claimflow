package com.claimflow.provider.controller;

import com.claimflow.provider.dto.CreateProviderRequest;
import com.claimflow.provider.entity.Provider;
import com.claimflow.provider.service.ProviderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/providers")
@RequiredArgsConstructor
public class ProviderController {

    private final ProviderService providerService;

    @GetMapping
    public List<Provider> getAll() {
        return providerService.getAllProviders();
    }

    @GetMapping("/{id}")
    public Provider getById(@PathVariable String id) {
        return providerService.getProvider(id);
    }

    /** Internal: auth-service links a hospital login to its hospital at start-up. */
    @GetMapping("/by-registration/{registrationNumber}")
    public Provider getByRegistration(@PathVariable String registrationNumber) {
        return providerService.getByRegistrationNumber(registrationNumber);
    }

    @PostMapping
    public ResponseEntity<Provider> create(@Valid @RequestBody CreateProviderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(providerService.createProvider(request));
    }
}
