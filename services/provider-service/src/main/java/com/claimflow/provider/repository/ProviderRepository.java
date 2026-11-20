package com.claimflow.provider.repository;

import com.claimflow.provider.entity.Provider;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProviderRepository extends JpaRepository<Provider, Long> {
    boolean existsByRegistrationNumber(String registrationNumber);
}
