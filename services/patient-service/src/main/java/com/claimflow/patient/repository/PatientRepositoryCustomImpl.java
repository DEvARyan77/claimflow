package com.claimflow.patient.repository;

import com.claimflow.patient.entity.Patient;
import lombok.RequiredArgsConstructor;
import org.bson.Document;
import org.bson.types.Decimal128;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.BasicQuery;
import org.springframework.data.mongodb.core.query.Update;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Coverage reservation without locks.
 *
 * With PostgreSQL this used SELECT ... FOR UPDATE (a row lock). In MongoDB the check and the
 * write happen in a single findAndModify:
 *
 *   filter: { _id: id, $expr: { $lte: [ { $add: ["$usedAmount", amount] }, "$coverageLimit" ] } }
 *   update: { $inc: { usedAmount: amount } }
 *
 * MongoDB applies a single-document update atomically, so if two claims arrive at the same moment
 * the second one is evaluated against the first one's result and can never push usedAmount past
 * coverageLimit.
 */
@RequiredArgsConstructor
public class PatientRepositoryCustomImpl implements PatientRepositoryCustom {

    private final MongoTemplate mongoTemplate;

    @Override
    public Optional<Patient> reserveCoverage(String id, BigDecimal amount) {
        if (!ObjectId.isValid(id)) {
            return Optional.empty();
        }
        Decimal128 add = new Decimal128(amount);
        Document filter = new Document("_id", new ObjectId(id))
                .append("$expr", new Document("$lte", List.of(
                        new Document("$add", List.of("$usedAmount", add)),
                        "$coverageLimit")));

        Patient updated = mongoTemplate.findAndModify(
                new BasicQuery(filter),
                new Update().inc("usedAmount", add),
                FindAndModifyOptions.options().returnNew(true),
                Patient.class);
        return Optional.ofNullable(updated);
    }
}
