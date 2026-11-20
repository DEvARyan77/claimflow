package com.claimflow.policy.rag;

import com.claimflow.policy.ai.LlmClient;
import com.claimflow.policy.config.RagProperties;
import com.claimflow.policy.dto.Dtos.Answer;
import com.claimflow.policy.dto.Dtos.AskRequest;
import com.claimflow.policy.dto.Dtos.DocumentSummary;
import com.claimflow.policy.dto.Dtos.PrecheckRequest;
import com.claimflow.policy.dto.Dtos.Source;
import com.claimflow.policy.rag.PolicyRepository.ChunkHit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.net.SocketTimeoutException;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * RAG step 2 (answering): question → find the closest policy chunks → give them to the language model
 * with strict instructions → answer with [1], [2] citations pointing to the exact pages.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyAssistantService {

    private static final String SYSTEM_PROMPT = """
            You are the ClaimFlow Policy Assistant. You act on behalf of the policy holder and explain their
            health insurance policy in plain, friendly English.
            Rules:
            1. Use ONLY the numbered policy excerpts you are given. Never invent amounts, limits or rules.
            2. Cite the excerpts you used, like [1] or [2][3], right after the sentence they support.
            3. If the excerpts don't answer the question, say so clearly and suggest what to ask the insurer.
            4. Always mention waiting periods, sub-limits, co-payments and exclusions that apply.
            5. Keep the answer under 180 words. Use short paragraphs or "- " bullets. No medical or legal advice.
            """;

    private final PolicyRepository repository;
    private final LlmClient llmClient;
    private final RagProperties ragProperties;

    public Answer ask(AskRequest request) {
        DocumentSummary document = resolveDocument(request.documentId());
        return answer(request.question().trim(), request.question().trim(), document);
    }

    public Answer precheck(PrecheckRequest request) {
        DocumentSummary document = resolveDocument(request.documentId());
        String treatment = (request.diagnosisLabel() == null || request.diagnosisLabel().isBlank())
                ? request.diagnosisCode()
                : request.diagnosisLabel() + " (ICD-10 " + request.diagnosisCode() + ")";
        String hospital = request.hospitalName() == null || request.hospitalName().isBlank()
                ? "a hospital" : request.hospitalName();
        String stay = request.daysInHospital() == null ? "" : ", " + request.daysInHospital() + " days in hospital";

        String question = """
                I am about to submit a claim for treatment of %s at %s, bill amount Rs. %s%s.
                Based on my policy, is this likely to be covered? Start your answer with exactly one of:
                LIKELY COVERED, PARTLY COVERED, NOT COVERED or NOT STATED IN POLICY.
                Then explain the clauses that matter: waiting periods, exclusions, sub-limits, room rent and co-payment.
                """.formatted(treatment, hospital, formatAmount(request.amount()), stay);

        String searchQuery = treatment + " treatment coverage waiting period exclusion sub-limit co-payment room rent hospitalisation";
        return answer(question, searchQuery, document);
    }

    private Answer answer(String question, String searchQuery, DocumentSummary document) {
        List<ChunkHit> hits = retrieve(searchQuery, document.id());
        List<Source> sources = toSources(hits);

        if (sources.isEmpty()) {
            return new Answer("I couldn't find anything about this in " + document.title() + ".", "search", null, List.of());
        }
        if (!llmClient.isEnabled()) {
            return searchOnly(sources, "AI is not set up, so here are the parts of the policy that best match your question.");
        }
        try {
            String reply = llmClient.chat(SYSTEM_PROMPT, buildUserPrompt(question, document, sources));
            return new Answer(reply, "ai", null, sources);
        } catch (Exception e) {
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) root = root.getCause();
            log.warn("Chat model call failed: {} (root cause: {}: {})", e.getMessage(), root.getClass().getSimpleName(), root.getMessage());
            return searchOnly(sources, whyAiFailed(e, root) + " Here are the parts of the policy that best match your question.");
        }
    }

    /** Turns the provider's error into a sentence a person can act on. */
    static String whyAiFailed(Exception e, Throwable root) {
        if (e instanceof RestClientResponseException http) {
            int code = http.getStatusCode().value();
            if (code == 429) return "The AI's free usage limit is used up for now (too many questions in a short time or today). Try again later.";
            if (code == 401 || code == 403) return "The AI key was rejected. Check LLM_API_KEY in your .env file.";
            if (code == 404) return "The AI model name wasn't found. Check LLM_CHAT_MODEL in your .env file.";
            if (code == 503) return "The AI is overloaded right now (Google reports high demand), even after retrying. Try again in a minute.";
            if (code >= 500) return "The AI service is having problems right now. Try again in a minute.";
        }
        if (root instanceof SocketTimeoutException) return "The AI took too long to answer.";
        if (e instanceof ResourceAccessException) return "The AI service couldn't be reached (check the internet connection).";
        return "The AI model couldn't be reached.";
    }

    /** Prefer the AI provider's embeddings (they understand meaning); fall back to the local ones. */
    private List<ChunkHit> retrieve(String query, String documentId) {
        int k = ragProperties.topKOrDefault();
        if (llmClient.isEnabled()) {
            try {
                float[] queryVector = llmClient.embed(List.of(query)).get(0);
                List<ChunkHit> hits = repository.searchByModelEmbedding(queryVector, llmClient.embeddingModel(), documentId, k);
                if (!hits.isEmpty()) {
                    return hits;
                }
            } catch (Exception e) {
                log.warn("Embedding search failed, using local search: {}", e.getMessage());
            }
        }
        return repository.searchByHashEmbedding(HashEmbedding.embed(query), documentId, k);
    }

    private static List<Source> toSources(List<ChunkHit> hits) {
        List<Source> sources = new ArrayList<>();
        for (ChunkHit hit : hits) {
            if (hit.score() <= 0.01) continue;   // nothing in common with the question
            sources.add(new Source(sources.size() + 1, hit.documentId(), hit.documentTitle(), hit.page(),
                    hit.content(), Math.round(hit.score() * 1000) / 1000.0));
        }
        return sources;
    }

    private static String buildUserPrompt(String question, DocumentSummary document, List<Source> sources) {
        StringBuilder sb = new StringBuilder("Policy: ").append(document.title()).append("\n\nPolicy excerpts:\n");
        for (Source s : sources) {
            sb.append('[').append(s.number()).append("] (page ").append(s.page()).append(") ").append(s.excerpt()).append("\n\n");
        }
        return sb.append("Question: ").append(question).toString();
    }

    private static Answer searchOnly(List<Source> sources, String note) {
        List<Source> top = sources.subList(0, Math.min(3, sources.size()));
        return new Answer("Here are the parts of your policy that best match your question. See the highlighted pages below.",
                "search", note, top);
    }

    private DocumentSummary resolveDocument(String documentId) {
        if (documentId != null) {
            return repository.findDocument(documentId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Policy document " + documentId + " not found"));
        }
        return repository.findSampleDocument()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No policy documents uploaded yet"));
    }

    private static String formatAmount(java.math.BigDecimal amount) {
        NumberFormat format = NumberFormat.getNumberInstance(Locale.of("en", "IN"));
        format.setMaximumFractionDigits(0);
        return format.format(amount);
    }
}
