package com.claimflow.patient.repository;

import com.claimflow.patient.entity.Patient;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoTemplate;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Runs against a real MongoDB (set MONGODB_TEST_URI, e.g. mongodb://localhost:27017).
 * Skipped when it isn't set, so a plain "mvn test" still works without a database.
 */
class CoverageReservationTest {

    private static MongoClient client;
    private static MongoTemplate mongo;
    private static PatientRepositoryCustomImpl repo;

    @BeforeAll
    static void connect() {
        String uri = System.getenv("MONGODB_TEST_URI");
        assumeTrue(uri != null && !uri.isBlank(), "MONGODB_TEST_URI not set: skipping MongoDB test");
        client = MongoClients.create(uri);
        mongo = new MongoTemplate(client, "patient_db_test");
        repo = new PatientRepositoryCustomImpl(mongo);
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
        mongo.dropCollection(Patient.class);
    }

    private Patient patient(String limit, String used) {
        Patient p = new Patient();
        p.setName("Test");
        p.setEmail(System.nanoTime() + "@test.dev");
        p.setPolicyNumber("POL" + System.nanoTime());
        p.setPolicyActive(true);
        p.setCoverageLimit(new BigDecimal(limit));
        p.setUsedAmount(new BigDecimal(used));
        return mongo.insert(p);
    }

    @Test
    void reservesWhenAmountFits() {
        Patient p = patient("500000", "100000");
        Patient updated = repo.reserveCoverage(p.getId(), new BigDecimal("50000.50")).orElseThrow();
        assertEquals(0, new BigDecimal("150000.50").compareTo(updated.getUsedAmount()));
        assertEquals(0, new BigDecimal("349999.50").compareTo(updated.getRemainingCoverage()));
    }

    @Test
    void reservesExactlyTheRemainingAmount() {
        Patient p = patient("200000", "150000");
        assertTrue(repo.reserveCoverage(p.getId(), new BigDecimal("50000")).isPresent());
        assertEquals(0, BigDecimal.ZERO.compareTo(mongo.findById(p.getId(), Patient.class).getRemainingCoverage()));
    }

    @Test
    void refusesWhenAmountDoesNotFitAndChangesNothing() {
        Patient p = patient("200000", "150000");
        assertTrue(repo.reserveCoverage(p.getId(), new BigDecimal("50000.01")).isEmpty());
        assertEquals(0, new BigDecimal("150000").compareTo(mongo.findById(p.getId(), Patient.class).getUsedAmount()));
    }

    @Test
    void unknownOrInvalidIdReturnsEmpty() {
        assertTrue(repo.reserveCoverage("64b7f0c2a1b2c3d4e5f60718", BigDecimal.ONE).isEmpty());
        assertTrue(repo.reserveCoverage("not-an-id", BigDecimal.ONE).isEmpty());
    }

    @Test
    void moneyIsStoredAsDecimal128NotDouble() {
        Patient p = patient("500000.10", "0");
        Object stored = mongo.getCollection("patients").find().first().get("coverageLimit");
        assertEquals("org.bson.types.Decimal128", stored.getClass().getName());
        assertEquals(0, new BigDecimal("500000.10").compareTo(mongo.findById(p.getId(), Patient.class).getCoverageLimit()));
    }

    /** The reason this exists: parallel approvals must never overspend a policy. */
    @Test
    void parallelClaimsNeverOverspendThePolicy() throws Exception {
        Patient p = patient("500000", "0");
        int claims = 40;                          // 40 claims of 30,000 = 12,00,000 requested
        BigDecimal each = new BigDecimal("30000");
        ExecutorService pool = Executors.newFixedThreadPool(16);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        for (int i = 0; i < claims; i++) {
            results.add(pool.submit(() -> {
                start.await();                    // release all threads at the same moment
                return repo.reserveCoverage(p.getId(), each).isPresent();
            }));
        }
        start.countDown();
        int approved = 0;
        for (Future<Boolean> f : results) {
            if (f.get()) approved++;
        }
        pool.shutdown();

        Patient after = mongo.findById(p.getId(), Patient.class);
        assertEquals(16, approved, "only floor(500000 / 30000) = 16 claims fit");
        assertEquals(0, new BigDecimal("480000").compareTo(after.getUsedAmount()));
        assertTrue(after.getRemainingCoverage().signum() >= 0, "coverage must never go negative");
    }
}
