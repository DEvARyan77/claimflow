package com.claimflow.policy.rag;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * A small embedding that needs no AI provider ("feature hashing"): every word and word pair is hashed into
 * one of 512 slots. Texts sharing words get similar vectors, so cosine search finds matching clauses.
 * It understands no synonyms (a real embedding model does), but it keeps the assistant useful offline.
 */
public final class HashEmbedding {

    public static final int DIMENSIONS = 512;
    public static final String MODEL_NAME = "local-hash-512";

    private static final Set<String> STOP_WORDS = Set.of(
            "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "be", "by", "as",
            "at", "it", "its", "this", "that", "with", "from", "will", "shall", "any", "all", "if", "my", "me",
            "i", "we", "you", "your", "our", "can", "do", "does", "what", "which", "who", "how", "there", "under",
            "per", "not", "no", "have", "has", "been", "such", "these", "those", "than", "then", "so", "would");

    private HashEmbedding() {
    }

    public static float[] embed(String text) {
        List<String> words = Stream.of(text.toLowerCase(Locale.ROOT).split("[^a-z0-9]+"))
                .filter(w -> w.length() > 1 && !STOP_WORDS.contains(w))
                .map(HashEmbedding::stem)
                .collect(Collectors.toList());

        Map<String, Double> weights = new HashMap<>();
        for (int i = 0; i < words.size(); i++) {
            weights.merge(words.get(i), 1.0, Double::sum);
            if (i + 1 < words.size()) {
                weights.merge(words.get(i) + "_" + words.get(i + 1), 0.6, Double::sum);
            }
        }

        float[] vector = new float[DIMENSIONS];
        weights.forEach((term, weight) -> {
            int hash = term.hashCode();
            int slot = Math.floorMod(hash, DIMENSIONS);
            float sign = ((hash >>> 20) & 1) == 0 ? 1f : -1f;
            vector[slot] += sign * (float) (1 + Math.log(weight));
        });
        return normalize(vector);
    }

    /** "surgeries" -> "surgery", "covers" -> "cover", "covered" -> "cover" (rough, but enough here) */
    private static String stem(String word) {
        if (word.length() > 4 && word.endsWith("ies")) return word.substring(0, word.length() - 3) + "y";
        if (word.length() > 4 && word.endsWith("ed")) return word.substring(0, word.length() - 2);
        if (word.length() > 5 && word.endsWith("ing")) return word.substring(0, word.length() - 3);
        if (word.length() > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.substring(0, word.length() - 1);
        return word;
    }

    private static float[] normalize(float[] vector) {
        double sum = 0;
        for (float v : vector) sum += v * v;
        if (sum == 0) {
            vector[0] = 1f;   // empty text: avoid a zero vector (cosine distance would be undefined)
            return vector;
        }
        float norm = (float) Math.sqrt(sum);
        for (int i = 0; i < vector.length; i++) vector[i] /= norm;
        return vector;
    }
}
