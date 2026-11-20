package com.claimflow.provider.service;

import com.claimflow.provider.dto.CreateProviderRequest;
import com.claimflow.provider.entity.Provider;
import com.claimflow.provider.exception.DuplicateProviderException;
import com.claimflow.provider.exception.ProviderNotFoundException;
import com.claimflow.provider.repository.ProviderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProviderService {

    private final ProviderRepository providerRepository;

    public Provider createProvider(CreateProviderRequest request) {
        String regNo = request.registrationNumber().trim().toUpperCase();
        if (providerRepository.existsByRegistrationNumber(regNo)) {
            throw new DuplicateProviderException(regNo);
        }
        Provider provider = new Provider();
        provider.setRegistrationNumber(regNo);
        provider.setName(request.name().trim());
        provider.setCity(request.city().trim());
        // trim + drop blanks so "Cardiology" and " Cardiology " count as one
        provider.setSpecializations(request.specializations().stream()
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toCollection(HashSet::new)));
        provider.setInNetwork(request.inNetwork() == null || request.inNetwork());
        try {
            return providerRepository.save(provider);
        } catch (DuplicateKeyException e) {
            // Two requests raced past the check above; the unique index stops the second one.
            throw new DuplicateProviderException(regNo);
        }
    }

    public Provider getProvider(String id) {
        return providerRepository.findById(id)
                .orElseThrow(() -> new ProviderNotFoundException(id));
    }

    public Provider getByRegistrationNumber(String regNo) {
        return providerRepository.findByRegistrationNumber(regNo.trim().toUpperCase())
                .orElseThrow(() -> new ProviderNotFoundException("registration " + regNo));
    }

    public List<Provider> getAllProviders() {
        return providerRepository.findAll().stream()
                .sorted(Comparator.comparing(Provider::getName))
                .toList();
    }
}
