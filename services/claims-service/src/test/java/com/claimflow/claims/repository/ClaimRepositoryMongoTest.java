package com.claimflow.claims.repository;

import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.ClaimStatus;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** Runs against a real MongoDB when MONGODB_TEST_URI is set; skipped otherwise. */
class ClaimRepositoryMongoTest {

    private static MongoClient client;
    private static MongoTemplate mongo;
    private static ClaimRepositoryCustomImpl repo;

    @BeforeAll
    static void connect() {
        String uri = System.getenv("MONGODB_TEST_URI");
        assumeTrue(uri != null && !uri.isBlank(), "MONGODB_TEST_URI not set: skipping MongoDB test");
        client = MongoClients.create(uri);
        mongo = new MongoTemplate(client, "claims_db_test");
        repo = new ClaimRepositoryCustomImpl(mongo);
    }

    @AfterAll
    static void close() {
        if (client != null) {
            mongo.getDb().drop();
            client.close();
        }
    }

    @BeforeEach
    void clean() {
        mongo.getDb().drop();
    }

    private Claim claim(ClaimStatus status) {
        Claim c = new Claim();
        c.setClaimNumber(repo.nextClaimNumber(2026));
        c.setPatientId("p1");
        c.setProviderId("h1");
        c.setDiagnosisCode("I21");
        c.setAmount(new BigDecimal("50000"));
        c.setStatus(status);
        c.setCreatedAt(LocalDateTime.now());
        return mongo.insert(c);
    }

    @Test
    void claimNumbersAreReadableAndSequential() {
        assertThat(repo.nextClaimNumber(2026)).isEqualTo("CLM-2026-000001");
        assertThat(repo.nextClaimNumber(2026)).isEqualTo("CLM-2026-000002");
        assertThat(repo.nextClaimNumber(2027)).isEqualTo("CLM-2027-000001"); // new year starts again
    }

    @Test
    void parallelClaimsNeverShareANumber() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(16);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<String>> futures = new ArrayList<>();
        for (int i = 0; i < 200; i++) {
            futures.add(pool.submit(() -> {
                start.await();
                return repo.nextClaimNumber(2026);
            }));
        }
        start.countDown();
        Set<String> numbers = new HashSet<>();
        for (Future<String> f : futures) numbers.add(f.get());
        pool.shutdown();
        assertThat(numbers).hasSize(200).contains("CLM-2026-000001", "CLM-2026-000200");
    }

    @Test
    void approvedClaimIsPaidExactlyOnce() throws Exception {
        Claim c = claim(ClaimStatus.APPROVED);
        // Payment-service retries can call mark-paid several times at once
        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Future<Optional<Claim>>> results = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            String ref = "PAY-" + i;
            results.add(pool.submit(() -> repo.markPaidIfApproved(c.getId(), ref)));
        }
        int paid = 0;
        for (Future<Optional<Claim>> f : results) if (f.get().isPresent()) paid++;
        pool.shutdown();

        Claim after = mongo.findById(c.getId(), Claim.class);
        assertThat(paid).isEqualTo(1);
        assertThat(after.getStatus()).isEqualTo(ClaimStatus.PAID);
        assertThat(after.getPaidAt()).isNotNull();
        assertThat(after.getPaymentReference()).startsWith("PAY-");
    }

    @Test
    void onlyApprovedClaimsCanBePaid() {
        Claim rejected = claim(ClaimStatus.REJECTED);
        assertThat(repo.markPaidIfApproved(rejected.getId(), "PAY-X")).isEmpty();
        assertThat(mongo.findById(rejected.getId(), Claim.class).getStatus()).isEqualTo(ClaimStatus.REJECTED);
    }

    @Test
    void statusIsStoredAsReadableText() {
        claim(ClaimStatus.APPROVED);
        assertThat(mongo.getCollection("claims").find().first().get("status")).isEqualTo("APPROVED");
    }
}
