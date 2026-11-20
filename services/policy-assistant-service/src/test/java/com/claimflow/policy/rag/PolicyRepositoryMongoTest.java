package com.claimflow.policy.rag;

import com.claimflow.policy.config.RagProperties;
import com.claimflow.policy.rag.PolicyRepository.ChunkHit;
import com.claimflow.policy.rag.PolicyRepository.NewChunk;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.mongodb.core.MongoTemplate;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Indexes the real sample policy and searches it.
 *   MONGODB_TEST_URI        plain MongoDB -> in-app cosine search
 *   ATLAS_LOCAL_TEST_URI    MongoDB Atlas Local -> Atlas Vector Search ($vectorSearch)
 * Each part is skipped when its variable isn't set.
 */
class PolicyRepositoryMongoTest {

    private static final List<MongoClient> clients = new ArrayList<>();

    private static String sampleText;

    @BeforeAll
    static void loadSample() throws Exception {
        sampleText = new String(new ClassPathResource("sample-policy/claimflow-secure-health-policy.txt")
                .getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    }

    private static final List<MongoTemplate> dbs = new ArrayList<>();

    @AfterAll
    static void close() {
        dbs.forEach(m -> m.getDb().drop());
        clients.forEach(MongoClient::close);
    }

    private record Setup(PolicyRepository repo, VectorSearchIndexes indexes, MongoTemplate mongo) {
    }

    private static Setup connect(String env, String mode) {
        String uri = System.getenv(env);
        assumeTrue(uri != null && !uri.isBlank(), env + " not set: skipping");
        MongoClient client = MongoClients.create(uri);
        clients.add(client);
        // A fresh database each run: Atlas search can lose an index created right after a drop.
        MongoTemplate mongo = new MongoTemplate(client, "policy_db_test_" + mode + "_" + System.nanoTime());
        dbs.add(mongo);
        VectorSearchIndexes indexes = new VectorSearchIndexes(mongo, mode);
        indexes.init();
        return new Setup(new PolicyRepository(mongo, indexes), indexes, mongo);
    }

    /** Same steps as PolicyIngestionService, without the AI and PDF parts. */
    private static String indexSample(PolicyRepository repo) {
        List<String> pages = new DocumentTextExtractor().extractPages("sample.txt", sampleText.getBytes(StandardCharsets.UTF_8));
        List<TextChunker.Chunk> chunks = new TextChunker(new RagProperties(160, 30, 5)).chunk(pages);
        List<NewChunk> rows = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            rows.add(new NewChunk(i, chunks.get(i).page(), chunks.get(i).content(),
                    HashEmbedding.embed(chunks.get(i).content()), null, null));
        }
        String id = repo.insertDocument("Sample policy", "sample.txt", null, true, pages.size(), rows.size());
        repo.insertChunks(id, rows);
        return id;
    }

    private static void assertFindsCataractClause(List<ChunkHit> hits) {
        assertThat(hits).isNotEmpty().hasSizeLessThanOrEqualTo(5);
        assertThat(hits).anySatisfy(h -> assertThat(h.content().toLowerCase()).contains("cataract"));
        assertThat(hits.get(0).score()).isBetween(0.0, 1.0001);
        for (int i = 1; i < hits.size(); i++) {
            assertThat(hits.get(i - 1).score()).isGreaterThanOrEqualTo(hits.get(i).score()); // best first
        }
    }

    /** Ground truth: score every chunk in plain Java, like pgvector's ORDER BY embedding <=> query did. */
    private static List<String> bruteForceTop(MongoTemplate mongo, float[] q, int k) {
        List<double[]> scored = new ArrayList<>();
        List<String> contents = new ArrayList<>();
        for (org.bson.Document d : mongo.getCollection(PolicyRepository.CHUNKS).find()) {
            contents.add(d.getString("content"));
            scored.add(new double[]{PolicyRepository.cosine(q, d.getList("hashEmbedding", Object.class)), contents.size() - 1});
        }
        scored.sort((a, b) -> Double.compare(b[0], a[0]));
        return scored.stream().limit(k).map(x -> contents.get((int) x[1])).toList();
    }

    @Test
    void inAppSearchFindsTheRightClause() {
        Setup s = connect("MONGODB_TEST_URI", "local");
        String id = indexSample(s.repo());
        assertThat(s.indexes().isAtlasAvailable()).isFalse();
        float[] q = HashEmbedding.embed("Is cataract surgery covered?");
        List<ChunkHit> hits = s.repo().searchByHashEmbedding(q, id, 5);
        assertFindsCataractClause(hits);
        assertThat(hits.stream().map(ChunkHit::content).toList()).isEqualTo(bruteForceTop(s.mongo(), q, 5));
        assertThat(s.repo().countChunks()).isGreaterThan(5);
        assertThat(s.repo().findSampleDocument()).isPresent();
    }

    @Test
    void atlasVectorSearchFindsTheSameClause() throws Exception {
        Setup s = connect("ATLAS_LOCAL_TEST_URI", "auto");
        assertThat(s.indexes().isAtlasAvailable()).as("Atlas Local supports search indexes").isTrue();
        String id = indexSample(s.repo());
        float[] q = HashEmbedding.embed("Is cataract surgery covered?");

        // Wait for the index to build (Atlas indexes asynchronously)
        long deadline = System.currentTimeMillis() + 90_000;
        while (!s.indexes().isAtlasSearchReady(PolicyRepository.HASH_INDEX) && System.currentTimeMillis() < deadline) {
            Thread.sleep(2000);
        }
        assertThat(s.indexes().isAtlasSearchReady(PolicyRepository.HASH_INDEX)).as("index became queryable").isTrue();

        List<ChunkHit> atlas = List.of();
        while (atlas.isEmpty() && System.currentTimeMillis() < deadline) {   // new documents are indexed within seconds
            atlas = s.repo().searchByHashEmbedding(q, id, 5);
            Thread.sleep(1000);
        }
        assertFindsCataractClause(atlas);

        // Atlas (approximate) and in-app (exact) search must agree on the best clause and its score
        Setup local = connect("ATLAS_LOCAL_TEST_URI", "local");
        String id2 = indexSample(local.repo());
        List<ChunkHit> exact = local.repo().searchByHashEmbedding(q, id2, 5);
        assertThat(atlas.get(0).content()).isEqualTo(exact.get(0).content());
        assertThat(atlas.get(0).score()).isCloseTo(exact.get(0).score(), org.assertj.core.data.Offset.offset(0.001));

        // Deleting removes the policy and its chunks
        String uploaded = indexSample(s.repo());
        s.mongo().getCollection(PolicyRepository.DOCUMENTS).updateOne(
                new org.bson.Document("_id", new org.bson.types.ObjectId(uploaded)),
                new org.bson.Document("$set", new org.bson.Document("sample", false)));
        assertThat(s.repo().deleteUploadedDocument(uploaded)).isTrue();
        assertThat(s.mongo().getCollection(PolicyRepository.CHUNKS)
                .countDocuments(new org.bson.Document("documentId", new org.bson.types.ObjectId(uploaded)))).isZero();
        assertThat(s.repo().deleteUploadedDocument(id)).as("the sample can't be deleted").isFalse();
    }
}
