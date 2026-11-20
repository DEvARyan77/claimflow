package com.claimflow.policy.config;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * Turns the provider name into concrete settings. Gemini, OpenAI and Ollama all speak the same
 * "OpenAI-compatible" HTTP API, so one client works for all of them; only URL and model names differ.
 */
@Slf4j
@Getter
@Component
public class AiSettings {

    private final String provider;
    private final boolean enabled;
    private final String baseUrl;
    private final String apiKey;
    private final String chatModel;
    private final String embeddingModel;
    private final int timeoutSeconds;
    /** How hard "thinking" models think before answering: low = much faster. Empty = don't send. */
    private final String reasoningEffort;
    /** Used when the main chat model is overloaded or out of quota. Empty = no backup. */
    private final String fallbackChatModel;

    public AiSettings(AiProperties props) {
        String name = blank(props.provider()) ? "none" : props.provider().trim().toLowerCase(Locale.ROOT);

        String defaultUrl;
        String defaultChat;
        String defaultEmbedding;
        String defaultReasoning = "";
        String defaultFallback = "";
        boolean needsKey = true;
        switch (name) {
            case "gemini" -> {
                defaultUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
                defaultChat = "gemini-3.8-flash";
                defaultEmbedding = "gemini-embedding-001";
                defaultReasoning = "low";     // Gemini 3.x thinks by default, which can take 40+ seconds
                defaultFallback = "gemini-3.5-flash-lite";   // separate free quota, rarely overloaded
            }
            case "openai" -> {
                defaultUrl = "https://api.openai.com/v1";
                defaultChat = "gpt-4o-mini";
                defaultEmbedding = "text-embedding-3-small";
            }
            case "ollama" -> {
                defaultUrl = "http://localhost:11434/v1";
                defaultChat = "llama3.2";
                defaultEmbedding = "nomic-embed-text";
                needsKey = false;
            }
            default -> {
                defaultUrl = "";
                defaultChat = "";
                defaultEmbedding = "";
                needsKey = false;
                name = "none";
            }
        }

        this.baseUrl = stripSlash(blank(props.baseUrl()) ? defaultUrl : props.baseUrl().trim());
        this.chatModel = blank(props.chatModel()) ? defaultChat : props.chatModel().trim();
        this.embeddingModel = blank(props.embeddingModel()) ? defaultEmbedding : props.embeddingModel().trim();
        this.apiKey = props.apiKey() == null ? "" : props.apiKey().trim();
        this.timeoutSeconds = props.timeoutSeconds() == null ? 180 : props.timeoutSeconds();
        String effort = props.reasoningEffort() == null ? "" : props.reasoningEffort().trim().toLowerCase(Locale.ROOT);
        this.reasoningEffort = effort.isEmpty() ? defaultReasoning : ("off".equals(effort) ? "" : effort);

        String fallback = props.fallbackChatModel() == null ? "" : props.fallbackChatModel().trim();
        fallback = fallback.isEmpty() ? defaultFallback : ("off".equalsIgnoreCase(fallback) ? "" : fallback);
        this.fallbackChatModel = fallback.equals(this.chatModel) ? "" : fallback;

        boolean missingKey = needsKey && this.apiKey.isEmpty();
        if (missingKey) {
            log.warn("LLM_PROVIDER={} but LLM_API_KEY is empty, so running in search-only mode", name);
        }
        this.provider = name;
        this.enabled = !"none".equals(name) && !missingKey;
        log.info("Policy assistant AI: {}", enabled
                ? provider + " (chat=" + chatModel + ", embeddings=" + embeddingModel
                        + (fallbackChatModel.isEmpty() ? "" : ", backup=" + fallbackChatModel)
                        + (reasoningEffort.isEmpty() ? "" : ", reasoning=" + reasoningEffort) + ")"
                : "off (search-only mode)");
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String stripSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
