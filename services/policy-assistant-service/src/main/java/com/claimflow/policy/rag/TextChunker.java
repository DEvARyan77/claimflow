package com.claimflow.policy.rag;

import com.claimflow.policy.config.RagProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Splits each page into overlapping word windows ("chunks").
 * Small chunks = precise search; the overlap keeps a clause that crosses a border inside at least one chunk.
 */
@Component
@RequiredArgsConstructor
public class TextChunker {

    private final RagProperties properties;

    public record Chunk(int page, String content) {
    }

    public List<Chunk> chunk(List<String> pages) {
        int size = properties.chunkWordsOrDefault();
        int step = Math.max(1, size - properties.overlapWordsOrDefault());
        List<Chunk> chunks = new ArrayList<>();

        for (int p = 0; p < pages.size(); p++) {
            String[] words = pages.get(p).split("\\s+");
            if (words.length == 0 || (words.length == 1 && words[0].isBlank())) {
                continue;
            }
            for (int start = 0; start < words.length; start += step) {
                int end = Math.min(words.length, start + size);
                chunks.add(new Chunk(p + 1, String.join(" ", Arrays.copyOfRange(words, start, end))));
                if (end == words.length) {
                    break;
                }
            }
        }
        return chunks;
    }
}
