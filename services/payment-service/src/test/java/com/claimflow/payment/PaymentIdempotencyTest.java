package com.claimflow.payment;

import com.claimflow.payment.entity.Payment;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver;
import org.springframework.data.mongodb.core.mapping.MongoMappingContext;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** The unique index on claimId is what makes a second payment for the same claim impossible. */
class PaymentIdempotencyTest {

    private static MongoClient client;
    private static MongoTemplate mongo;

    @BeforeAll
    static void connect() {
        String uri = System.getenv("MONGODB_TEST_URI");
        assumeTrue(uri != null && !uri.isBlank(), "MONGODB_TEST_URI not set: skipping MongoDB test");
        client = MongoClients.create(uri);
        mongo = new MongoTemplate(client, "payment_db_test");
        mongo.getDb().drop();
        // Create the @Indexed indexes the same way auto-index-creation does at start-up
        MongoMappingContext ctx = (MongoMappingContext) mongo.getConverter().getMappingContext();
        new MongoPersistentEntityIndexResolver(ctx).resolveIndexFor(Payment.class)
                .forEach(index -> mongo.indexOps(Payment.class).createIndex(index));
    }

    @AfterAll
    static void close() {
        if (client != null) {
            mongo.getDb().drop();
            client.close();
        }
    }

    private Payment payment(String claimId, String ref) {
        Payment p = new Payment();
        p.setClaimId(claimId);
        p.setClaimNumber("CLM-2026-000001");
        p.setPatientId("p1");
        p.setProviderId("h1");
        p.setAmount(new BigDecimal("50000"));
        p.setReference(ref);
        p.setPaidAt(LocalDateTime.now());
        return p;
    }

    @Test
    void secondPaymentForSameClaimIsRefused() {
        mongo.insert(payment("claim-1", "PAY-AAAA0001"));
        assertThatThrownBy(() -> mongo.insert(payment("claim-1", "PAY-BBBB0002")))
                .isInstanceOf(DuplicateKeyException.class);
        assertThat(mongo.findAll(Payment.class)).hasSize(1);
    }
}
