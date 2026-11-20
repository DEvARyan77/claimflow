package com.claimflow.policy.rag;

import com.claimflow.policy.ai.LlmClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Adds the AI model's embeddings to chunks that don't have them yet: documents uploaded while the AI
 * was off/unreachable, or after you switch to a different embedding model.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmbeddingBackfillJob {

    private static final int BATCH = 32;

    private final LlmClient llmClient;
    private final PolicyRepository repository;

    @Scheduled(initialDelay = 15_000, fixedDelay = 120_000)
    public void backfill() {
        if (!llmClient.isEnabled()) {
            return;
        }
        String model = llmClient.embeddingModel();
        int done = 0;
        try {
            List<PolicyRepository.ChunkText> batch;
            while (!(batch = repository.findChunksWithoutModelEmbedding(model, BATCH)).isEmpty()) {
                List<float[]> vectors = llmClient.embed(batch.stream().map(PolicyRepository.ChunkText::content).toList());
                for (int i = 0; i < batch.size(); i++) {
                    repository.updateModelEmbedding(batch.get(i).id(), vectors.get(i), model);
                }
                done += batch.size();
            }
        } catch (Exception e) {
            log.warn("Embedding backfill paused ({}); will retry later", e.getMessage());
        }
        if (done > 0) {
            log.info("Added {} embeddings for model {}", done, model);
        }
    }
}
