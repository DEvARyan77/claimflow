package com.claimflow.provider.config;

import com.claimflow.provider.dto.CreateProviderRequest;
import com.claimflow.provider.repository.ProviderRepository;
import com.claimflow.provider.service.ProviderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.Set;

/** Adds demo hospitals the first time the service starts (only when the table is empty). */
@Slf4j
@Component
@RequiredArgsConstructor
public class DemoDataSeeder implements CommandLineRunner {

    private final ProviderRepository providerRepository;
    private final ProviderService providerService;

    @Override
    public void run(String... args) {
        if (providerRepository.count() > 0) {
            return;
        }
        providerService.createProvider(new CreateProviderRequest(
                "ROH-DL-1001", "Apollo Hospital", "New Delhi",
                Set.of("Cardiology", "Orthopedics", "General Medicine"), true));
        providerService.createProvider(new CreateProviderRequest(
                "ROH-HR-1002", "Fortis Memorial Hospital", "Gurugram",
                Set.of("Neurology", "Oncology"), true));
        providerService.createProvider(new CreateProviderRequest(
                "ROH-DL-1003", "Max Super Speciality Hospital", "Saket, New Delhi",
                Set.of("Cardiology", "Pulmonology", "Gastroenterology"), true));
        providerService.createProvider(new CreateProviderRequest(
                "ROH-UP-2001", "City Care Clinic", "Noida",
                Set.of("Orthopedics", "General Medicine"), false));
        log.info("Seeded 4 demo hospitals (City Care Clinic is out-of-network on purpose)");
    }
}
