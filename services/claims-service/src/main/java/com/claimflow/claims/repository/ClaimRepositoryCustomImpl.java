package com.claimflow.claims.repository;

import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.entity.ClaimStatus;
import lombok.RequiredArgsConstructor;
import org.bson.Document;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.time.LocalDateTime;
import java.util.Optional;

@RequiredArgsConstructor
public class ClaimRepositoryCustomImpl implements ClaimRepositoryCustom {

    private static final String COUNTERS = "counters";

    private final MongoTemplate mongoTemplate;

    /**
     * MongoDB has no auto-increment, so a small "counters" collection holds one document per year:
     * { _id: "claim-2026", seq: 123 }. $inc + upsert + returnNew is a single atomic operation,
     * so two claims submitted at the same moment always get different numbers.
     */
    @Override
    public String nextClaimNumber(int year) {
        Document counter = mongoTemplate.getCollection(COUNTERS).findOneAndUpdate(
                new Document("_id", "claim-" + year),
                new Document("$inc", new Document("seq", 1)),
                new com.mongodb.client.model.FindOneAndUpdateOptions()
                        .upsert(true)
                        .returnDocument(com.mongodb.client.model.ReturnDocument.AFTER));
        long seq = ((Number) counter.get("seq")).longValue();
        return "CLM-%d-%06d".formatted(year, seq);
    }

    @Override
    public Optional<Claim> markPaidIfApproved(String id, String paymentReference) {
        Query approved = new Query(Criteria.where("_id").is(id).and("status").is(ClaimStatus.APPROVED));
        Update pay = new Update()
                .set("status", ClaimStatus.PAID)
                .set("paymentReference", paymentReference)
                .set("paidAt", LocalDateTime.now());
        return Optional.ofNullable(mongoTemplate.findAndModify(approved, pay,
                FindAndModifyOptions.options().returnNew(true), Claim.class));
    }
}
