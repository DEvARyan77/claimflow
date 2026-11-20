package com.claimflow.auth.config;

import com.claimflow.auth.client.Clients.PatientClient;
import com.claimflow.auth.client.Clients.ProviderClient;
import com.claimflow.auth.entity.User;
import com.claimflow.auth.repository.UserRepository;
import com.claimflow.security.Roles;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

/**
 * Demo logins for every role (password: password123). Policyholders are linked to the demo policies and
 * hospital logins to the demo hospitals, which live in other services. Those may still be starting, so
 * this runs every 20 s until every demo user exists, then stops doing anything.
 * Turn off with SEED_DEMO_USERS=false.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DemoUsersSeeder {

    static final String PASSWORD = "password123";

    private record Demo(String email, String name, String role, String policyNumber, String hospitalRegNo) {
    }

    private static final List<Demo> DEMO = List.of(
            new Demo("admin@claimflow.dev", "Asha Admin", Roles.ADMIN, null, null),
            new Demo("officer@claimflow.dev", "Neha Kapoor", Roles.OFFICER, null, null),
            new Demo("apollo@claimflow.dev", "Apollo Hospital desk", Roles.HOSPITAL, null, "ROH-DL-1001"),
            new Demo("max@claimflow.dev", "Max Hospital desk", Roles.HOSPITAL, null, "ROH-DL-1003"),
            new Demo("rahul@claimflow.dev", "Rahul Sharma", Roles.POLICYHOLDER, "POL1001", null),
            new Demo("priya@claimflow.dev", "Priya Nair", Roles.POLICYHOLDER, "POL1002", null),
            new Demo("amit@claimflow.dev", "Amit Verma", Roles.POLICYHOLDER, "POL1003", null));

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final PatientClient patientClient;
    private final ProviderClient providerClient;

    @Value("${claimflow.auth.seed-demo-users:true}")
    private boolean enabled;

    private volatile boolean done;

    @Scheduled(initialDelay = 10_000, fixedDelay = 20_000)
    public void seed() {
        if (!enabled || done) return;
        int missing = 0;
        for (Demo d : DEMO) {
            if (users.existsByEmail(d.email())) continue;
            try {
                User u = new User();
                u.setEmail(d.email());
                u.setName(d.name());
                u.setRole(d.role());
                if (d.policyNumber() != null) u.setPatientId(patientClient.byPolicy(d.policyNumber()).id());
                if (d.hospitalRegNo() != null) u.setProviderId(providerClient.byRegistration(d.hospitalRegNo()).id());
                u.setPasswordHash(passwordEncoder.encode(PASSWORD));
                u.setCreatedAt(Instant.now());
                users.save(u);
                log.info("Demo login ready: {} ({})", d.email(), d.role());
            } catch (Exception e) {
                missing++;   // patient/provider service not up yet: try again next time
                log.debug("Demo user {} not created yet: {}", d.email(), e.getMessage());
            }
        }
        if (missing == 0) {
            done = true;
            log.info("All demo logins are ready (password: {})", PASSWORD);
        }
    }
}
