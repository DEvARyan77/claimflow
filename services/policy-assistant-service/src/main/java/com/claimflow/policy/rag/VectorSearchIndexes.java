package com.claimflow.policy.rag;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.SearchIndexModel;
import com.mongodb.client.model.SearchIndexType;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Creates and watches the Atlas Vector Search indexes on policy_chunks.
 *
 * claimflow.rag.vector-search:
 *   auto  (default) use Atlas Vector Search when the cluster supports it, otherwise in-app search
 *   atlas           same as auto, but logs a warning if Atlas search isn't available
 *   local           never use Atlas Vector Search
 *
 * Index definitions (vectorSearch type):
 *   hash_embedding_index:  hashEmbedding (512 dims, cosine) + filter documentId
 *   model_embedding_index: embedding (dims of the AI model, cosine) + filters documentId, embeddingModel
 *     (created the first time an AI embedding is stored, because only then is its size known)
 */
@Slf4j
@Component
public class VectorSearchIndexes {

    private static final long RECHECK_MS = 15_000;

    private final MongoTemplate mongo;
    private final String mode;

    private volatile boolean atlasAvailable;
    private final Map<String, Boolean> ready = new ConcurrentHashMap<>();
    private final Map<String, Long> lastCheck = new ConcurrentHashMap<>();
    private final Map<String, Document> definitions = new ConcurrentHashMap<>();   // to recreate a lost index

    public VectorSearchIndexes(MongoTemplate mongo, @Value("${claimflow.rag.vector-search:auto}") String mode) {
        this.mongo = mongo;
        this.mode = mode.trim().toLowerCase();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void init() {
        if ("local".equals(mode)) {
            log.info("Vector search: in-app cosine search (claimflow.rag.vector-search=local)");
            return;
        }
        try {
            if (!mongo.collectionExists(PolicyRepository.CHUNKS)) {
                mongo.createCollection(PolicyRepository.CHUNKS);    // search indexes need the collection
            }
            chunks().listSearchIndexes().into(new java.util.ArrayList<>());   // throws if not Atlas
            atlasAvailable = true;
            createIfMissing(PolicyRepository.HASH_INDEX, definition("hashEmbedding", 512, false));
            log.info("Vector search: Atlas Vector Search ($vectorSearch), with in-app search as fallback");
        } catch (Exception e) {
            atlasAvailable = false;
            String msg = "Vector search: Atlas Vector Search not available on this MongoDB, using in-app cosine search";
            if ("atlas".equals(mode)) log.warn("{} ({})", msg, e.getMessage());
            else log.info(msg);
        }
    }

    /** Called when AI embeddings are stored; creates the model index once their size is known. */
    public void ensureModelIndex(int dimensions) {
        if (!atlasAvailable || ready.containsKey(PolicyRepository.MODEL_INDEX)) return;
        try {
            createIfMissing(PolicyRepository.MODEL_INDEX, definition("embedding", dimensions, true));
        } catch (Exception e) {
            log.warn("Couldn't create {}: {}", PolicyRepository.MODEL_INDEX, e.getMessage());
        }
    }

    /** True when Atlas search is available and this index has finished building ("queryable"). */
    public boolean isAtlasSearchReady(String index) {
        if (!atlasAvailable) return false;
        if (Boolean.TRUE.equals(ready.get(index))) return true;
        long now = System.currentTimeMillis();
        if (now - lastCheck.getOrDefault(index, 0L) < RECHECK_MS) return false;
        lastCheck.put(index, now);
        try {
            for (Document d : chunks().listSearchIndexes().name(index)) {
                boolean queryable = Boolean.TRUE.equals(d.getBoolean("queryable"));
                if (queryable) {
                    ready.put(index, true);
                    log.info("Atlas Vector Search index {} is ready", index);
                }
                return queryable;
            }
            // The index is gone (e.g. someone dropped the collection): create it again.
            Document definition = definitions.get(index);
            if (definition != null) {
                log.warn("Atlas Vector Search index {} is missing; creating it again", index);
                createIfMissing(index, definition);
            }
        } catch (Exception e) {
            log.warn("Couldn't read search index status: {}", e.getMessage());
        }
        return false;
    }

    public boolean isAtlasAvailable() {
        return atlasAvailable;
    }

    private void createIfMissing(String name, Document definition) {
        definitions.put(name, definition);
        for (Document existing : chunks().listSearchIndexes().name(name)) {
            ready.put(name, Boolean.TRUE.equals(existing.getBoolean("queryable")));
            return;
        }
        chunks().createSearchIndexes(List.of(new SearchIndexModel(name, definition, SearchIndexType.vectorSearch())));
        ready.put(name, false);
        log.info("Creating Atlas Vector Search index {} (takes a few seconds)", name);
    }

    private static Document definition(String path, int dimensions, boolean byModel) {
        List<Document> fields = new java.util.ArrayList<>(List.of(
                new Document("type", "vector").append("path", path)
                        .append("numDimensions", dimensions).append("similarity", "cosine"),
                new Document("type", "filter").append("path", "documentId")));
        if (byModel) {
            fields.add(new Document("type", "filter").append("path", "embeddingModel"));
        }
        return new Document("fields", fields);
    }

    private MongoCollection<Document> chunks() {
        return mongo.getCollection(PolicyRepository.CHUNKS);
    }
}
