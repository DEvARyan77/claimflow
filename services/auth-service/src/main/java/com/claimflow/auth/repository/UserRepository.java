package com.claimflow.auth.repository;

import com.claimflow.auth.entity.User;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByEmail(String email);

    Optional<User> findByAlternateEmail(String alternateEmail);

    Optional<User> findByPatientId(String patientId);

    boolean existsByEmail(String email);

    boolean existsByPatientId(String patientId);

    List<User> findAllByOrderByRoleAscNameAsc();
}
