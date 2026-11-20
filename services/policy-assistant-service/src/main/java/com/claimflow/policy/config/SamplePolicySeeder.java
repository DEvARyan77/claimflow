package com.claimflow.policy.config;

import com.claimflow.policy.rag.PolicyIngestionService;
import com.claimflow.policy.rag.PolicyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;

/** Indexes a sample (fictional) policy on first start, so the assistant can be tried immediately. */
@Slf4j
@Component
@RequiredArgsConstructor
public class SamplePolicySeeder implements CommandLineRunner {

    private static final String SAMPLE = "sample-policy/claimflow-secure-health-policy.txt";

    private final PolicyRepository repository;
    private final PolicyIngestionService ingestionService;

    @Override
    public void run(String... args) throws Exception {
        if (repository.countDocuments() > 0) {
            return;
        }
        try (InputStream in = new ClassPathResource(SAMPLE).getInputStream()) {
            ingestionService.ingest("ClaimFlow Secure Health Policy (sample)",
                    "claimflow-secure-health-policy.txt", null, in.readAllBytes(), true);
        }
        log.info("Indexed the sample policy");
    }
}
