package com.claimflow.claims.repository;

import com.claimflow.claims.entity.Claim;
import com.claimflow.claims.dto.ClaimStats;
import com.claimflow.claims.entity.ClaimStatus;
import com.claimflow.claims.entity.FraudAssessment;
import lombok.RequiredArgsConstructor;
import org.bson.Document;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    public Optional<Claim> lockForReview(String id) {
        Query reviewable = new Query(Criteria.where("_id").is(id)
                .and("status").in(ClaimStatus.UNDER_REVIEW, ClaimStatus.INFO_REQUESTED)
                .and("reviewLock").ne(true));
        return Optional.ofNullable(mongoTemplate.findAndModify(reviewable, new Update().set("reviewLock", true),
                FindAndModifyOptions.options().returnNew(true), Claim.class));
    }

    @Override
    public void saveAiReview(String id, FraudAssessment.AiStatus status, String summary, String recommendation) {
        mongoTemplate.updateFirst(new Query(Criteria.where("_id").is(id)),
                new Update().set("fraud.aiStatus", status)
                        .set("fraud.aiSummary", summary)
                        .set("fraud.aiRecommendation", recommendation),
                Claim.class);
    }

    @Override
    public ClaimStats stats() {
        Map<String, ClaimStats.Bucket> byStatus = new LinkedHashMap<>();
        for (Document d : mongoTemplate.getCollection("claims").aggregate(List.of(
                new Document("$group", new Document("_id", "$status")
                        .append("count", new Document("$sum", 1))
                        .append("amount", new Document("$sum", "$amount")))))) {
            byStatus.put(String.valueOf(d.get("_id")), new ClaimStats.Bucket(
                    ((Number) d.get("count")).longValue(), decimal(d.get("amount"))));
        }
        Map<String, Long> byRisk = new LinkedHashMap<>();
        for (Document d : mongoTemplate.getCollection("claims").aggregate(List.of(
                new Document("$match", new Document("fraud.level", new Document("$exists", true))),
                new Document("$group", new Document("_id", "$fraud.level").append("count", new Document("$sum", 1)))))) {
            byRisk.put(String.valueOf(d.get("_id")), ((Number) d.get("count")).longValue());
        }
        long total = byStatus.values().stream().mapToLong(ClaimStats.Bucket::count).sum();
        return new ClaimStats(total, byStatus, byRisk);
    }

    private static java.math.BigDecimal decimal(Object value) {
        if (value instanceof org.bson.types.Decimal128 d) return d.bigDecimalValue();
        if (value instanceof Number n) return new java.math.BigDecimal(n.toString());
        return java.math.BigDecimal.ZERO;
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
