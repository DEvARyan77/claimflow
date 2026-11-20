package com.claimflow.provider.repository;

import com.claimflow.provider.entity.Provider;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface ProviderRepository extends MongoRepository<Provider, String> {
    boolean existsByRegistrationNumber(String registrationNumber);

    java.util.Optional<Provider> findByRegistrationNumber(String registrationNumber);
}
