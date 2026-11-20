package com.claimflow.policy.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** All request/response shapes of the Policy Assistant API, in one place. */
public final class Dtos {

    private Dtos() {
    }

    public record DocumentSummary(
            String id,
            String title,
            String fileName,
            String policyNumber,
            boolean sample,
            int pages,
            int chunks,
            LocalDateTime uploadedAt) {
    }

    public record AskRequest(
            @NotBlank @Size(max = 1000) String question,
            String documentId) {
    }

    /** "Will this claim be covered?" asked before submitting it. */
    public record PrecheckRequest(
            String documentId,
            @NotBlank String diagnosisCode,
            String diagnosisLabel,
            @NotNull @Positive BigDecimal amount,
            String hospitalName,
            Integer daysInHospital) {
    }

    /** One policy passage used for an answer. "number" matches the [1], [2] citations in the answer. */
    public record Source(
            int number,
            String documentId,
            String documentTitle,
            int page,
            String excerpt,
            double score) {
    }

    /** mode = "ai" (written by the language model) or "search" (no model: the best-matching passages) */
    public record Answer(
            String answer,
            String mode,
            String note,
            List<Source> sources) {
    }

    public record AssistantStatus(
            String provider,
            boolean aiEnabled,
            String chatModel,
            String embeddingModel,
            long documents,
            long chunks,
            long chunksWaitingForEmbedding) {
    }
}
