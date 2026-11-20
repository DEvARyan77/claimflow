package com.claimflow.policy.rag;

import com.claimflow.policy.ai.LlmClient;
import com.claimflow.policy.dto.Dtos.DocumentSummary;
import com.claimflow.policy.rag.PolicyRepository.NewChunk;
import com.claimflow.policy.rag.TextChunker.Chunk;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * RAG step 1 (indexing): file → pages of text → chunks → embeddings → PostgreSQL (pgvector).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyIngestionService {

    private final DocumentTextExtractor extractor;
    private final TextChunker chunker;
    private final LlmClient llmClient;
    private final PolicyRepository repository;

    @Transactional
    public DocumentSummary ingest(String title, String fileName, String policyNumber, byte[] content, boolean sample) {
        List<String> pages = extractor.extractPages(fileName, content);
        List<Chunk> chunks = chunker.chunk(pages);

        List<float[]> modelEmbeddings = embedWithModel(chunks);
        List<NewChunk> rows = new ArrayList<>(chunks.size());
        for (int i = 0; i < chunks.size(); i++) {
            Chunk chunk = chunks.get(i);
            rows.add(new NewChunk(
                    i,
                    chunk.page(),
                    chunk.content(),
                    HashEmbedding.embed(chunk.content()),
                    modelEmbeddings == null ? null : modelEmbeddings.get(i),
                    modelEmbeddings == null ? null : llmClient.embeddingModel()));
        }

        long id = repository.insertDocument(title, fileName, blankToNull(policyNumber), sample, pages.size(), rows.size());
        repository.insertChunks(id, rows);
        log.info("Indexed '{}': {} pages, {} chunks, model embeddings: {}",
                title, pages.size(), rows.size(), modelEmbeddings != null);
        return repository.findDocument(id).orElseThrow();
    }

    /** null when AI is off or unreachable: EmbeddingBackfillJob adds the model embeddings later. */
    private List<float[]> embedWithModel(List<Chunk> chunks) {
        if (!llmClient.isEnabled() || chunks.isEmpty()) {
            return null;
        }
        try {
            return llmClient.embed(chunks.stream().map(Chunk::content).toList());
        } catch (Exception e) {
            log.warn("Embedding model unavailable ({}); stored local embeddings only for now", e.getMessage());
            return null;
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
