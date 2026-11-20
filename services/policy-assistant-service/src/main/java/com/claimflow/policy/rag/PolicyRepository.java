package com.claimflow.policy.rag;

import com.claimflow.policy.dto.Dtos.DocumentSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Plain SQL with JdbcTemplate, because pgvector's operators (<=> = cosine distance) aren't part of JPA.
 * Vectors travel as text like "[0.12,-0.03,...]" and PostgreSQL turns them into the vector type.
 */
@Repository
@RequiredArgsConstructor
public class PolicyRepository {

    private final JdbcTemplate jdbc;

    public record NewChunk(int index, int page, String content, float[] hashEmbedding, float[] embedding, String embeddingModel) {
    }

    public record ChunkHit(long chunkId, long documentId, String documentTitle, int page, String content, double score) {
    }

    public record ChunkText(long id, String content) {
    }

    private static final RowMapper<DocumentSummary> DOCUMENT_ROW = (rs, n) -> new DocumentSummary(
            rs.getLong("id"),
            rs.getString("title"),
            rs.getString("file_name"),
            rs.getString("policy_number"),
            rs.getBoolean("is_sample"),
            rs.getInt("pages"),
            rs.getInt("chunks"),
            rs.getTimestamp("uploaded_at").toLocalDateTime());

    private static final RowMapper<ChunkHit> HIT_ROW = (rs, n) -> new ChunkHit(
            rs.getLong("id"),
            rs.getLong("document_id"),
            rs.getString("title"),
            rs.getInt("page"),
            rs.getString("content"),
            rs.getDouble("score"));

    // ---------- documents ----------

    public long insertDocument(String title, String fileName, String policyNumber, boolean sample, int pages, int chunks) {
        return jdbc.queryForObject("""
                INSERT INTO policy_documents (title, file_name, policy_number, is_sample, pages, chunks)
                VALUES (?, ?, ?, ?, ?, ?) RETURNING id
                """, Long.class, title, fileName, policyNumber, sample, pages, chunks);
    }

    public List<DocumentSummary> findAllDocuments() {
        return jdbc.query("SELECT * FROM policy_documents ORDER BY is_sample DESC, uploaded_at DESC", DOCUMENT_ROW);
    }

    public Optional<DocumentSummary> findDocument(long id) {
        return jdbc.query("SELECT * FROM policy_documents WHERE id = ?", DOCUMENT_ROW, id).stream().findFirst();
    }

    public Optional<DocumentSummary> findSampleDocument() {
        return jdbc.query("SELECT * FROM policy_documents WHERE is_sample ORDER BY id LIMIT 1", DOCUMENT_ROW)
                .stream().findFirst();
    }

    public boolean deleteUploadedDocument(long id) {
        return jdbc.update("DELETE FROM policy_documents WHERE id = ? AND NOT is_sample", id) > 0;
    }

    public long countDocuments() {
        return jdbc.queryForObject("SELECT count(*) FROM policy_documents", Long.class);
    }

    // ---------- chunks ----------

    public void insertChunks(long documentId, List<NewChunk> chunks) {
        List<Object[]> withEmbedding = new ArrayList<>();
        List<Object[]> hashOnly = new ArrayList<>();
        for (NewChunk c : chunks) {
            if (c.embedding() != null) {
                withEmbedding.add(new Object[]{documentId, c.index(), c.page(), c.content(),
                        toVector(c.hashEmbedding()), toVector(c.embedding()), c.embeddingModel()});
            } else {
                hashOnly.add(new Object[]{documentId, c.index(), c.page(), c.content(), toVector(c.hashEmbedding())});
            }
        }
        if (!withEmbedding.isEmpty()) {
            jdbc.batchUpdate("""
                    INSERT INTO policy_chunks (document_id, chunk_index, page, content, hash_embedding, embedding, embedding_model)
                    VALUES (?, ?, ?, ?, ?::vector, ?::vector, ?)
                    """, withEmbedding);
        }
        if (!hashOnly.isEmpty()) {
            jdbc.batchUpdate("""
                    INSERT INTO policy_chunks (document_id, chunk_index, page, content, hash_embedding)
                    VALUES (?, ?, ?, ?, ?::vector)
                    """, hashOnly);
        }
    }

    /** Nearest chunks by the always-available local hash embedding. */
    public List<ChunkHit> searchByHashEmbedding(float[] query, long documentId, int limit) {
        String vector = toVector(query);
        return jdbc.query("""
                SELECT c.id, c.document_id, d.title, c.page, c.content,
                       1 - (c.hash_embedding <=> ?::vector) AS score
                FROM policy_chunks c JOIN policy_documents d ON d.id = c.document_id
                WHERE c.document_id = ?
                ORDER BY c.hash_embedding <=> ?::vector
                LIMIT ?
                """, HIT_ROW, vector, documentId, vector, limit);
    }

    /** Nearest chunks by the AI provider's embedding (only chunks embedded with the same model). */
    public List<ChunkHit> searchByModelEmbedding(float[] query, String model, long documentId, int limit) {
        String vector = toVector(query);
        return jdbc.query("""
                SELECT c.id, c.document_id, d.title, c.page, c.content,
                       1 - (c.embedding <=> ?::vector) AS score
                FROM policy_chunks c JOIN policy_documents d ON d.id = c.document_id
                WHERE c.document_id = ? AND c.embedding_model = ?
                ORDER BY c.embedding <=> ?::vector
                LIMIT ?
                """, HIT_ROW, vector, documentId, model, vector, limit);
    }

    public List<ChunkText> findChunksWithoutModelEmbedding(String model, int limit) {
        return jdbc.query("""
                SELECT id, content FROM policy_chunks
                WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM ?
                ORDER BY id LIMIT ?
                """, (rs, n) -> new ChunkText(rs.getLong("id"), rs.getString("content")), model, limit);
    }

    public void updateModelEmbedding(long chunkId, float[] embedding, String model) {
        jdbc.update("UPDATE policy_chunks SET embedding = ?::vector, embedding_model = ? WHERE id = ?",
                toVector(embedding), model, chunkId);
    }

    public long countChunks() {
        return jdbc.queryForObject("SELECT count(*) FROM policy_chunks", Long.class);
    }

    public long countChunksWithoutModelEmbedding(String model) {
        return jdbc.queryForObject(
                "SELECT count(*) FROM policy_chunks WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM ?",
                Long.class, model);
    }

    static String toVector(float[] values) {
        StringBuilder sb = new StringBuilder(values.length * 10).append('[');
        for (int i = 0; i < values.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(values[i]);
        }
        return sb.append(']').toString();
    }
}
