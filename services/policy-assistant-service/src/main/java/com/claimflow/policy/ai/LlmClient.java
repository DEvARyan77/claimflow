package com.claimflow.policy.ai;

import com.claimflow.policy.config.AiSettings;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Minimal client for the OpenAI-compatible API (POST /chat/completions and POST /embeddings).
 * Works with Gemini, OpenAI and Ollama. Written by hand on purpose, so every RAG step is visible.
 */
@Slf4j
@Component
public class LlmClient {

    private static final int EMBEDDING_BATCH = 16;
    private static final int MAX_ATTEMPTS = 3;
    private static final long[] RETRY_DELAYS_MS = {1500, 4000};

    private final AiSettings settings;
    private final RestClient restClient;

    public LlmClient(AiSettings settings) {
        this.settings = settings;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(settings.getTimeoutSeconds()));

        RestClient.Builder builder = RestClient.builder()
                .requestFactory(factory)
                .requestInterceptor(new JsonContentTypeInterceptor())   // provider replies are always JSON
                .baseUrl(settings.getBaseUrl().isEmpty() ? "http://localhost" : settings.getBaseUrl());
        if (!settings.getApiKey().isEmpty()) {
            builder.defaultHeader("Authorization", "Bearer " + settings.getApiKey());
        }
        this.restClient = builder.build();
    }

    public boolean isEnabled() {
        return settings.isEnabled();
    }

    public String embeddingModel() {
        return settings.getEmbeddingModel();
    }

    /** Sends system + user messages, returns the model's reply text. */
    public String chat(String systemPrompt, String userPrompt) {
        return withRetries(model -> new ChatRequest(
                model,
                List.of(new ChatMessage("system", systemPrompt), new ChatMessage("user", userPrompt)),
                0.2,
                reasoningEffort()));
    }

    /**
     * Like chat(), but the user message is made of parts: text and images (vision).
     * Build parts with textPart(...) and imagePart(...).
     */
    public String chatWithParts(String systemPrompt, List<Map<String, Object>> userParts) {
        return withRetries(model -> new VisionRequest(
                model,
                List.of(new VisionMessage("system", systemPrompt), new VisionMessage("user", userParts)),
                0.0,
                reasoningEffort()));
    }

    /**
     * AI providers are sometimes briefly overloaded (503 "high demand") or out of quota (429).
     *  - busy (500/502/503/504): wait a moment and try the same model again, up to 3 times
     *  - still busy, or out of quota: ask the backup model (e.g. gemini-3.5-flash-lite)
     * Timeouts are not retried: they already waited a long time.
     */
    private String withRetries(Function<String, Object> requestForModel) {
        List<String> models = new ArrayList<>(List.of(settings.getChatModel()));
        if (!settings.getFallbackChatModel().isEmpty()) {
            models.add(settings.getFallbackChatModel());
        }
        RestClientResponseException lastError = null;
        for (String model : models) {
            for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    String reply = send(requestForModel.apply(model));
                    if (!model.equals(settings.getChatModel())) {
                        log.info("Answered by the backup model {}", model);
                    }
                    return reply;
                } catch (RestClientResponseException e) {
                    lastError = e;
                    int code = e.getStatusCode().value();
                    boolean busy = code == 500 || code == 502 || code == 503 || code == 504;
                    if (!busy || attempt == MAX_ATTEMPTS) {
                        log.warn("{} failed with {}{}", model, code,
                                models.indexOf(model) < models.size() - 1 ? ", trying the backup model" : "");
                        break;
                    }
                    long waitMs = RETRY_DELAYS_MS[attempt - 1];
                    log.warn("{} is busy ({}), retrying in {} ms (attempt {}/{})", model, code, waitMs, attempt + 1, MAX_ATTEMPTS);
                    pause(waitMs);
                }
            }
        }
        throw lastError;
    }

    private String send(Object body) {
        ChatResponse response = restClient.post()
                .uri("/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(ChatResponse.class);
        if (response == null || response.choices() == null || response.choices().isEmpty()
                || response.choices().get(0).message() == null || response.choices().get(0).message().content() == null) {
            throw new IllegalStateException("The AI provider returned an empty answer");
        }
        return response.choices().get(0).message().content().trim();
    }

    private String reasoningEffort() {
        return settings.getReasoningEffort().isEmpty() ? null : settings.getReasoningEffort();
    }

    private static void pause(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public static Map<String, Object> textPart(String text) {
        return Map.of("type", "text", "text", text);
    }

    /** An image sent inline as a data URL, e.g. "data:image/jpeg;base64,...." */
    public static Map<String, Object> imagePart(String mimeType, byte[] image) {
        String url = "data:" + mimeType + ";base64," + Base64.getEncoder().encodeToString(image);
        return Map.of("type", "image_url", "image_url", Map.of("url", url));
    }

    /** Turns texts into vectors (one per text, same order), in small batches. */
    public List<float[]> embed(List<String> texts) {
        List<float[]> vectors = new ArrayList<>(texts.size());
        for (int start = 0; start < texts.size(); start += EMBEDDING_BATCH) {
            List<String> batch = texts.subList(start, Math.min(texts.size(), start + EMBEDDING_BATCH));
            EmbeddingResponse response = restClient.post()
                    .uri("/embeddings")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new EmbeddingRequest(settings.getEmbeddingModel(), batch))
                    .retrieve()
                    .body(EmbeddingResponse.class);
            if (response == null || response.data() == null || response.data().size() != batch.size()) {
                throw new IllegalStateException("The AI provider returned the wrong number of embeddings");
            }
            response.data().stream()
                    .sorted(Comparator.comparingInt(EmbeddingData::index))
                    .forEach(d -> vectors.add(toFloats(d.embedding())));
        }
        return vectors;
    }

    private static float[] toFloats(List<Double> values) {
        float[] result = new float[values.size()];
        for (int i = 0; i < values.size(); i++) {
            result[i] = values.get(i).floatValue();
        }
        return result;
    }

    // ---- JSON shapes of the OpenAI-compatible API ----

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ChatRequest(String model, List<ChatMessage> messages, double temperature,
                       @JsonProperty("reasoning_effort") String reasoningEffort) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ChatMessage(String role, String content) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record VisionRequest(String model, List<VisionMessage> messages, double temperature,
                         @JsonProperty("reasoning_effort") String reasoningEffort) {
    }

    /** content is either a String or a list of parts (text / image_url) */
    record VisionMessage(String role, Object content) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ChatResponse(List<Choice> choices) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Choice(ChatMessage message) {
    }

    record EmbeddingRequest(String model, List<String> input) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record EmbeddingResponse(List<EmbeddingData> data) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record EmbeddingData(int index, List<Double> embedding) {
    }
}
