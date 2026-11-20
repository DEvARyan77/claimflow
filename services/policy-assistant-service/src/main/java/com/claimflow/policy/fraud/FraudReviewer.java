package com.claimflow.policy.fraud;

import com.claimflow.policy.ai.LlmClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Explains a flagged claim to the claims officer: what looks wrong, what to check, and a suggestion.
 * Uses Gemini when an AI key is set; otherwise writes a plain summary from the rule-based flags.
 * Advice only: the officer always decides.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FraudReviewer {

    public record Flag(String label, String detail, int points) {
    }

    public record Request(String claimNumber, String claimType, String diagnosisCode, String treatment, BigDecimal amount,
                          BigDecimal typicalCost, LocalDate admissionDate, LocalDate dischargeDate, LocalDate policyStartDate,
                          BigDecimal coverLeft, int score, String level, List<Flag> flags) {
    }

    /** status: DONE (Gemini) or OFF (no AI key: rule-based summary). */
    public record Review(String status, String summary, String recommendation) {
    }

    private static final String SYSTEM_PROMPT = """
            You help a claims officer at an Indian health insurer review a flagged claim.
            Be factual and brief. Use only the facts given. Never accuse anyone of fraud: say what looks unusual
            and what the officer should check (documents, hospital records, earlier claims).
            """;

    private static final String FORMAT = """
            Answer in exactly this format:
            SUMMARY: <2-3 short sentences: what is unusual and what to verify>
            RECOMMENDATION: <one word: APPROVE, INVESTIGATE or REJECT>
            """;

    private static final Pattern SUMMARY = Pattern.compile("(?is)SUMMARY\\s*:\\s*(.+?)(?:\\n\\s*\\**\\s*RECOMMENDATION|$)");
    private static final Pattern RECOMMENDATION = Pattern.compile("(?i)RECOMMENDATION\\s*:\\s*\\**\\s*(APPROVE|INVESTIGATE|REJECT)");

    private final LlmClient llmClient;

    public Review review(Request request) {
        if (!llmClient.isEnabled()) {
            return new Review("OFF", ruleSummary(request), ruleRecommendation(request));
        }
        String reply = llmClient.chat(SYSTEM_PROMPT, facts(request) + "\n" + FORMAT);
        Matcher summary = SUMMARY.matcher(reply == null ? "" : reply);
        Matcher recommendation = RECOMMENDATION.matcher(reply == null ? "" : reply);
        String text = summary.find() ? summary.group(1).trim() : (reply == null ? "" : reply.trim());
        if (text.isBlank()) {
            return new Review("OFF", ruleSummary(request), ruleRecommendation(request));
        }
        if (text.length() > 700) text = text.substring(0, 700).trim() + "…";
        String advice = recommendation.find() ? recommendation.group(1).toUpperCase(Locale.ROOT) : "INVESTIGATE";
        return new Review("DONE", text, advice);
    }

    private static String facts(Request r) {
        StringBuilder sb = new StringBuilder();
        sb.append("Claim ").append(r.claimNumber()).append(" (").append(r.claimType() == null ? "REIMBURSEMENT" : r.claimType()).append(")\n");
        sb.append("Treatment: ").append(r.treatment() == null ? "" : r.treatment() + " ").append("ICD-10 ").append(r.diagnosisCode()).append('\n');
        sb.append("Bill: ").append(inr(r.amount()));
        if (r.typicalCost() != null) sb.append(" (usual cost for this treatment about ").append(inr(r.typicalCost())).append(')');
        sb.append('\n');
        if (r.admissionDate() != null) {
            sb.append("Hospital stay: ").append(r.admissionDate()).append(" to ")
                    .append(r.dischargeDate() == null ? "not discharged yet" : r.dischargeDate()).append('\n');
        }
        if (r.policyStartDate() != null) sb.append("Policy started: ").append(r.policyStartDate()).append('\n');
        if (r.coverLeft() != null) sb.append("Cover left before this claim: ").append(inr(r.coverLeft())).append('\n');
        sb.append("Rule-based risk score: ").append(r.score()).append("/100 (").append(r.level()).append(")\nRed flags:\n");
        r.flags().forEach(f -> sb.append("- ").append(f.label()).append(": ").append(f.detail()).append(" (+").append(f.points()).append(")\n"));
        return sb.toString();
    }

    /** Without AI: a readable summary built from the flags. */
    static String ruleSummary(Request r) {
        if (r.flags() == null || r.flags().isEmpty()) {
            return "No red flags were found.";
        }
        String main = r.flags().getFirst().detail();
        String rest = r.flags().size() > 1 ? " Also: " + String.join("; ",
                r.flags().subList(1, r.flags().size()).stream().map(f -> f.label().toLowerCase(Locale.ROOT)).toList()) + "." : "";
        return "Main concern: " + main + "." + rest + " Check the hospital bills and discharge summary before deciding.";
    }

    static String ruleRecommendation(Request r) {
        return "HIGH".equals(r.level()) ? "INVESTIGATE" : r.score() >= 45 ? "INVESTIGATE" : "APPROVE";
    }

    private static String inr(BigDecimal value) {
        if (value == null) return "₹0";
        String digits = value.setScale(0, RoundingMode.HALF_UP).toBigInteger().toString();
        if (digits.length() <= 3) return "₹" + digits;
        String last3 = digits.substring(digits.length() - 3);
        String rest = digits.substring(0, digits.length() - 3);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < rest.length(); i++) {
            if (i > 0 && (rest.length() - i) % 2 == 0) sb.append(',');
            sb.append(rest.charAt(i));
        }
        return "₹" + sb + "," + last3;
    }
}
