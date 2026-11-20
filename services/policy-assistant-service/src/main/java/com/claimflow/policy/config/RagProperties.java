package com.claimflow.policy.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "claimflow.rag")
public record RagProperties(Integer chunkWords, Integer overlapWords, Integer topK) {

    public int chunkWordsOrDefault() {
        return chunkWords == null ? 160 : chunkWords;
    }

    public int overlapWordsOrDefault() {
        return overlapWords == null ? 30 : overlapWords;
    }

    public int topKOrDefault() {
        return topK == null ? 5 : topK;
    }
}
