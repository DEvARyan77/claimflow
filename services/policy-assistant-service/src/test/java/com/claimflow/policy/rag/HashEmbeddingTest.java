package com.claimflow.policy.rag;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HashEmbeddingTest {

    private static double cosine(float[] a, float[] b) {
        double dot = 0;
        for (int i = 0; i < a.length; i++) dot += a[i] * b[i];
        return dot;   // vectors are already normalized
    }

    @Test
    void vectorsAreNormalized() {
        float[] v = HashEmbedding.embed("Cataract surgery is covered up to Rs. 40,000 per eye");
        assertThat(v).hasSize(HashEmbedding.DIMENSIONS);
        assertThat(cosine(v, v)).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-4));
    }

    @Test
    void relatedTextIsCloserThanUnrelatedText() {
        float[] question = HashEmbedding.embed("Is cataract surgery covered?");
        float[] related = HashEmbedding.embed("Cataract surgeries are covered up to Rs. 40,000 per eye after a 2 year waiting period.");
        float[] unrelated = HashEmbedding.embed("Ambulance charges are paid up to Rs. 2,000 per hospitalisation.");
        assertThat(cosine(question, related)).isGreaterThan(cosine(question, unrelated));
    }

    @Test
    void emptyTextDoesNotProduceZeroVector() {
        float[] v = HashEmbedding.embed("the and of");
        assertThat(cosine(v, v)).isGreaterThan(0.99);
    }
}
