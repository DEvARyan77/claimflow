package com.claimflow.policy.profile;

import com.claimflow.policy.ai.LlmClient;
import com.claimflow.policy.rag.DocumentTextExtractor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * "Auto-pickup": reads a policy PDF or a photo of the policy and finds the policy holder's details,
 * so the patient profile can be filled in automatically (the person checks them before saving).
 *   PDF / text  → text extraction → AI reads it (falls back to text patterns when AI is off)
 *   photo       → AI vision model reads the image (needs AI)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProfileExtractor {

    public record ExtractedProfile(String name, String email, String phone, String policyNumber,
                                   Long coverageLimit, String method, String note) {
    }

    private static final int MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    private static final int MAX_TEXT_CHARS = 12_000;

    private static final String SYSTEM_PROMPT =
            "You read Indian health insurance documents and copy out details exactly as written. Never guess.";

    private static final String INSTRUCTIONS = """
            Find the policy holder's (insured person's) details in this health insurance policy.
            Answer with exactly these 5 lines and nothing else. Write UNKNOWN when a value isn't shown.
            NAME: <full name of the insured person / policy holder>
            EMAIL: <email address>
            PHONE: <mobile number>
            POLICY_NUMBER: <policy number>
            SUM_INSURED: <sum insured / coverage amount in rupees, digits only, e.g. 500000>
            """;

    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern PHONE = Pattern.compile("(?:\\+91[\\s-]?)?[6-9]\\d{4}[\\s-]?\\d{5}");
    private static final Pattern POLICY_NUMBER = Pattern.compile(
            "(?i)policy\\s*(?:no\\.?|number|#)\\s*[:\\-]?\\s*([A-Z0-9][A-Z0-9/\\-]{3,})");
    private static final Pattern SUM_INSURED = Pattern.compile(
            "(?i)sum\\s*insured\\s*[:\\-]?\\s*(?:rs\\.?|inr|₹)?\\s*([\\d,]+(?:\\.\\d+)?\\s*(?:lakhs?|lacs?|crores?)?)");
    private static final Pattern NAME = Pattern.compile(
            "(?i)(?:name\\s+of\\s+(?:the\\s+)?insured|insured\\s+(?:person|name)|policy\\s*holder(?:'s)?\\s*(?:name)?|proposer(?:'s)?\\s*name)"
                    + "\\s*[:\\-]\\s*([A-Za-z][A-Za-z .']{2,60})");
    private static final Pattern ANSWER_LINE = Pattern.compile("^[\\s*\\-]*([A-Z_ ]{4,20})[\\s*]*:\\s*(.+)$");

    private final DocumentTextExtractor textExtractor;
    private final LlmClient llmClient;

    public ExtractedProfile extract(String fileName, String contentType, byte[] content) {
        String name = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        boolean image = name.matches(".*\\.(jpe?g|png|webp)$") || (contentType != null && contentType.startsWith("image/"));
        return image ? fromImage(name, contentType, content) : fromDocument(fileName, content);
    }

    private ExtractedProfile fromImage(String name, String contentType, byte[] content) {
        if (!llmClient.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Reading a photo needs AI. Add an AI key (see README) or upload the policy as a PDF.");
        }
        if (content.length > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The photo is larger than 8 MB.");
        }
        String mime = contentType != null && contentType.startsWith("image/") ? contentType
                : name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
        try {
            String reply = llmClient.chatWithParts(SYSTEM_PROMPT,
                    List.of(LlmClient.textPart(INSTRUCTIONS), LlmClient.imagePart(mime, content)));
            return build(parseAnswer(reply), "ai", "Read from your photo with AI. Please check every field.");
        } catch (Exception e) {
            log.warn("Reading the photo failed: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "The AI couldn't read this photo right now. Try again, or upload the policy PDF.");
        }
    }

    private ExtractedProfile fromDocument(String fileName, byte[] content) {
        List<String> pages = textExtractor.extractPages(fileName, content);
        String text = String.join("\n", pages.subList(0, Math.min(4, pages.size())));
        if (text.length() > MAX_TEXT_CHARS) text = text.substring(0, MAX_TEXT_CHARS);

        Map<String, String> found = findWithPatterns(text);
        if (!llmClient.isEnabled()) {
            return build(found, "pattern", "Filled from the document's text. Please check every field.");
        }
        try {
            Map<String, String> ai = parseAnswer(llmClient.chat(SYSTEM_PROMPT, INSTRUCTIONS + "\nDOCUMENT:\n" + text));
            found.putAll(ai);   // AI answers win; patterns fill what the AI left out
            return build(found, "ai", "Read from your policy with AI. Please check every field.");
        } catch (Exception e) {
            log.warn("AI profile extraction failed, using patterns: {}", e.getMessage());
            return build(found, "pattern", "AI wasn't reachable, so we filled what we could find. Please check every field.");
        }
    }

    static Map<String, String> findWithPatterns(String text) {
        Map<String, String> found = new LinkedHashMap<>();
        firstGroup(NAME, text, 1).ifPresent(v -> found.put("NAME", v.trim()));
        firstGroup(EMAIL, text, 0).ifPresent(v -> found.put("EMAIL", v));
        firstGroup(PHONE, text, 0).ifPresent(v -> found.put("PHONE", v));
        firstGroup(POLICY_NUMBER, text, 1).ifPresent(v -> found.put("POLICY_NUMBER", v));
        firstGroup(SUM_INSURED, text, 1).ifPresent(v -> found.put("SUM_INSURED", v.trim()));
        return found;
    }

    /** Reads the "KEY: value" lines the model was asked to write. */
    static Map<String, String> parseAnswer(String reply) {
        Map<String, String> values = new LinkedHashMap<>();
        for (String line : reply.split("\\R")) {
            Matcher m = ANSWER_LINE.matcher(line.trim());
            if (!m.matches()) continue;
            String key = m.group(1).trim().replace(' ', '_');
            String value = m.group(2).replace("**", "").replace("\"", "").trim();
            if (value.isEmpty() || value.matches("(?i)unknown|n/?a|null|none|-+|not (?:shown|found|mentioned).*")) continue;
            values.put(key, value);
        }
        return values;
    }

    private static ExtractedProfile build(Map<String, String> v, String method, String note) {
        return new ExtractedProfile(
                titleCase(v.get("NAME")),
                v.get("EMAIL") == null ? null : v.get("EMAIL").toLowerCase(Locale.ROOT),
                v.get("PHONE"),
                v.get("POLICY_NUMBER") == null ? null : v.get("POLICY_NUMBER").toUpperCase(Locale.ROOT),
                parseAmount(v.get("SUM_INSURED")),
                method,
                note);
    }

    /** "5,00,000" → 500000, "5 lakh" → 500000, "1.5 crore" → 15000000 */
    static Long parseAmount(String value) {
        if (value == null) return null;
        String lower = value.toLowerCase(Locale.ROOT);
        Matcher number = Pattern.compile("\\d[\\d,]*(?:\\.\\d+)?").matcher(lower);
        if (!number.find()) return null;
        double amount = Double.parseDouble(number.group().replace(",", ""));
        if (lower.contains("crore")) amount *= 10_000_000;
        else if (lower.contains("lakh") || lower.contains("lac")) amount *= 100_000;
        return amount > 0 ? Math.round(amount) : null;
    }

    private static String titleCase(String name) {
        if (name == null || name.isBlank()) return null;
        String[] words = name.trim().toLowerCase(Locale.ROOT).split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String w : words) {
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        }
        return sb.toString();
    }

    private static java.util.Optional<String> firstGroup(Pattern pattern, String text, int group) {
        Matcher m = pattern.matcher(text);
        return m.find() ? java.util.Optional.of(m.group(group)) : java.util.Optional.empty();
    }
}
