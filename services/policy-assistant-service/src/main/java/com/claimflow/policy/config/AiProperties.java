package com.claimflow.policy.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Raw values from policy-assistant-service.yml (claimflow.ai.*). Defaults are resolved in AiSettings. */
@ConfigurationProperties(prefix = "claimflow.ai")
public record AiProperties(
        String provider,
        String apiKey,
        String baseUrl,
        String chatModel,
        String embeddingModel,
        Integer timeoutSeconds,
        String reasoningEffort,
        String fallbackChatModel
) {
}
