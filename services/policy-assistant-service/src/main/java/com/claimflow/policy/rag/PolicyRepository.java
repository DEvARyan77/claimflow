package com.claimflow.policy.rag;

import com.claimflow.policy.dto.Dtos.DocumentSummary;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

/**
 * Policy documents and their chunks in MongoDB (policy_db).
 *
 *   policy_documents: { _id, title, fileName, policyNumber, sample, pages, chunks, uploadedAt }
 *   policy_chunks:    { _id, documentId, chunkIndex, page, content,
 *                       hashEmbedding: [512 floats],          // local, always present
 *                       embedding: [n floats], embeddingModel } // from the AI provider, when on
 *
 * Search ("which chunks are closest to the question?") has two engines:
 *   1. Atlas Vector Search ($vectorSearch) on MongoDB Atlas / Atlas Local. See VectorSearchIndexes.
 *   2. Cosine similarity computed here in Java over the chosen policy's chunks. A policy has a few
 *      hundred chunks at most, so this takes milliseconds. Used when Atlas search isn't available,
 *      and when a just-uploaded policy isn't in the search index yet.
 * Scores are cosine similarity (-1..1) either way, so the rest of the app doesn't care which ran.
 */
@Slf4j
@Repository
public class PolicyRepository {

    static final String DOCUMENTS = "policy_documents";
    static final String CHUNKS = "policy_chunks";
    static final String HASH_INDEX = "hash_embedding_index";
    static final String MODEL_INDEX = "model_embedding_index";

    private final MongoTemplate mongo;
    private final VectorSearchIndexes indexes;

    public PolicyRepository(MongoTemplate mongo, VectorSearchIndexes indexes) {
        this.mongo = mongo;
        this.indexes = indexes;
    }

    public record NewChunk(int index, int page, String content, float[] hashEmbedding, float[] embedding, String embeddingModel) {
    }

    public record ChunkHit(String chunkId, String documentId, String documentTitle, int page, String content, double score) {
    }

    public record ChunkText(String id, String content) {
    }

    // ---------- documents ----------

    public String insertDocument(String title, String fileName, String policyNumber, boolean sample, int pages, int chunks) {
        Document doc = new Document("title", title)
                .append("fileName", fileName)
                .append("policyNumber", policyNumber)
                .append("sample", sample)
                .append("pages", pages)
                .append("chunks", chunks)
                .append("uploadedAt", new Date());
        mongo.getCollection(DOCUMENTS).insertOne(doc);
        return doc.getObjectId("_id").toHexString();
    }

    public List<DocumentSummary> findAllDocuments() {
        Query q = new Query().with(Sort.by(Sort.Order.desc("sample"), Sort.Order.desc("uploadedAt")));
        return mongo.find(q, Document.class, DOCUMENTS).stream().map(PolicyRepository::toSummary).toList();
    }

    public Optional<DocumentSummary> findDocument(String id) {
        if (!ObjectId.isValid(id)) return Optional.empty();
        return Optional.ofNullable(mongo.findById(new ObjectId(id), Document.class, DOCUMENTS)).map(PolicyRepository::toSummary);
    }

    public Optional<DocumentSummary> findSampleDocument() {
        Query q = new Query(Criteria.where("sample").is(true)).with(Sort.by("uploadedAt")).limit(1);
        return Optional.ofNullable(mongo.findOne(q, Document.class, DOCUMENTS)).map(PolicyRepository::toSummary);
    }

    /** Deletes an uploaded policy and its chunks. The sample policy can't be deleted. */
    public boolean deleteUploadedDocument(String id) {
        if (!ObjectId.isValid(id)) return false;
        ObjectId oid = new ObjectId(id);
        long removed = mongo.remove(new Query(Criteria.where("_id").is(oid).and("sample").is(false)), DOCUMENTS).getDeletedCount();
        if (removed > 0) {
            mongo.remove(new Query(Criteria.where("documentId").is(oid)), CHUNKS);   // what ON DELETE CASCADE did
        }
        return removed > 0;
    }

    public long countDocuments() {
        return mongo.getCollection(DOCUMENTS).countDocuments();
    }

    // ---------- chunks ----------

    public void insertChunks(String documentId, List<NewChunk> chunks) {
        if (chunks.isEmpty()) return;
        ObjectId docId = new ObjectId(documentId);
        List<Document> rows = new ArrayList<>(chunks.size());
        for (NewChunk c : chunks) {
            Document row = new Document("documentId", docId)
                    .append("chunkIndex", c.index())
                    .append("page", c.page())
                    .append("content", c.content())
                    .append("hashEmbedding", toList(c.hashEmbedding()));
            if (c.embedding() != null) {
                row.append("embedding", toList(c.embedding())).append("embeddingModel", c.embeddingModel());
                indexes.ensureModelIndex(c.embedding().length);
            }
            rows.add(row);
        }
        mongo.getCollection(CHUNKS).insertMany(rows);
    }

    /** Nearest chunks by the always-available local hash embedding. */
    public List<ChunkHit> searchByHashEmbedding(float[] query, String documentId, int limit) {
        return search("hashEmbedding", HASH_INDEX, query, null, documentId, limit);
    }

    /** Nearest chunks by the AI provider's embedding (only chunks embedded with the same model). */
    public List<ChunkHit> searchByModelEmbedding(float[] query, String model, String documentId, int limit) {
        return search("embedding", MODEL_INDEX, query, model, documentId, limit);
    }

    private List<ChunkHit> search(String path, String index, float[] query, String model, String documentId, int limit) {
        if (!ObjectId.isValid(documentId)) return List.of();
        ObjectId docId = new ObjectId(documentId);
        String title = findDocument(documentId).map(DocumentSummary::title).orElse("");

        if (indexes.isAtlasSearchReady(index)) {
            try {
                List<ChunkHit> hits = atlasSearch(path, index, query, model, docId, title, limit);
                if (!hits.isEmpty()) {
                    return hits;
                }
                // Empty: usually a policy uploaded seconds ago that Atlas hasn't indexed yet.
            } catch (Exception e) {
                log.warn("Atlas Vector Search failed ({}); using in-app search", e.getMessage());
            }
        }
        return localSearch(path, query, model, docId, title, limit);
    }

    /** $vectorSearch: approximate nearest neighbours, filtered to one policy (and one model). */
    private List<ChunkHit> atlasSearch(String path, String index, float[] query, String model,
                                       ObjectId docId, String title, int limit) {
        Document filter = new Document("documentId", docId);
        if (model != null) filter.append("embeddingModel", model);
        List<Document> pipeline = List.of(
                new Document("$vectorSearch", new Document("index", index)
                        .append("path", path)
                        .append("queryVector", toList(query))
                        .append("numCandidates", Math.max(100, limit * 20))
                        .append("limit", limit)
                        .append("filter", filter)),
                new Document("$project", new Document("page", 1).append("content", 1).append("documentId", 1)
                        .append("score", new Document("$meta", "vectorSearchScore"))));
        List<ChunkHit> hits = new ArrayList<>();
        for (Document d : mongo.getCollection(CHUNKS).aggregate(pipeline)) {
            // For "cosine" indexes Atlas reports (1 + cosine) / 2; convert back to plain cosine.
            double cosine = 2 * ((Number) d.get("score")).doubleValue() - 1;
            hits.add(new ChunkHit(d.getObjectId("_id").toHexString(), docId.toHexString(), title,
                    d.getInteger("page"), d.getString("content"), cosine));
        }
        return hits;
    }

    /** Exact cosine similarity over the policy's chunks, best first. */
    private List<ChunkHit> localSearch(String path, float[] query, String model, ObjectId docId, String title, int limit) {
        Query q = new Query(Criteria.where("documentId").is(docId));
        if (model != null) q.addCriteria(Criteria.where("embeddingModel").is(model));
        q.fields().include("page", "content", path);

        PriorityQueue<ChunkHit> best = new PriorityQueue<>(Comparator.comparingDouble(ChunkHit::score));
        for (Document d : mongo.find(q, Document.class, CHUNKS)) {
            List<?> vector = d.getList(path, Object.class);
            if (vector == null || vector.size() != query.length) continue;
            best.add(new ChunkHit(d.getObjectId("_id").toHexString(), docId.toHexString(), title,
                    d.getInteger("page"), d.getString("content"), cosine(query, vector)));
            if (best.size() > limit) best.poll();
        }
        List<ChunkHit> hits = new ArrayList<>(best);
        hits.sort(Comparator.comparingDouble(ChunkHit::score).reversed());
        return hits;
    }

    public List<ChunkText> findChunksWithoutModelEmbedding(String model, int limit) {
        Query q = new Query(Criteria.where("embeddingModel").ne(model)).with(Sort.by("_id")).limit(limit);
        q.fields().include("content");
        return mongo.find(q, Document.class, CHUNKS).stream()
                .map(d -> new ChunkText(d.getObjectId("_id").toHexString(), d.getString("content")))
                .toList();
    }

    public void updateModelEmbedding(String chunkId, float[] embedding, String model) {
        mongo.updateFirst(new Query(Criteria.where("_id").is(new ObjectId(chunkId))),
                new Update().set("embedding", toList(embedding)).set("embeddingModel", model), CHUNKS);
        indexes.ensureModelIndex(embedding.length);
    }

    public long countChunks() {
        return mongo.getCollection(CHUNKS).countDocuments();
    }

    public long countChunksWithoutModelEmbedding(String model) {
        return mongo.count(new Query(Criteria.where("embeddingModel").ne(model)), CHUNKS);
    }

    // ---------- helpers ----------

    static double cosine(float[] a, List<?> b) {
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            double y = ((Number) b.get(i)).doubleValue();
            dot += a[i] * y;
            na += a[i] * a[i];
            nb += y * y;
        }
        return na == 0 || nb == 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    static List<Double> toList(float[] values) {
        List<Double> list = new ArrayList<>(values.length);
        for (float v : values) list.add((double) v);
        return list;
    }

    private static DocumentSummary toSummary(Document d) {
        Date uploaded = d.getDate("uploadedAt");
        return new DocumentSummary(
                d.getObjectId("_id").toHexString(),
                d.getString("title"),
                d.getString("fileName"),
                d.getString("policyNumber"),
                Boolean.TRUE.equals(d.getBoolean("sample")),
                d.getInteger("pages", 0),
                d.getInteger("chunks", 0),
                uploaded == null ? null : LocalDateTime.ofInstant(uploaded.toInstant(), ZoneId.systemDefault()));
    }
}
