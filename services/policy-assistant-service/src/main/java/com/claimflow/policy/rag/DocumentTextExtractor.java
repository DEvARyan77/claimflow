package com.claimflow.policy.rag;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/** Reads a policy file into a list of page texts (index 0 = page 1). */
@Component
public class DocumentTextExtractor {

    /** Plain-text policies can mark page breaks with a line like "=== Page 3 ===" (or a form-feed). */
    private static final String TEXT_PAGE_BREAK = "(?m)^=== Page \\d+ ===\\s*$|\\f";

    public List<String> extractPages(String fileName, byte[] content) {
        String name = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        List<String> pages;
        if (name.endsWith(".pdf")) {
            pages = fromPdf(content);
        } else if (name.endsWith(".txt") || name.endsWith(".md")) {
            pages = fromText(new String(content, StandardCharsets.UTF_8));
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please upload a PDF or a .txt file");
        }
        if (pages.stream().allMatch(String::isBlank)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No text found in this file. If it's a scanned PDF, please upload a text-based PDF.");
        }
        return pages;
    }

    private List<String> fromPdf(byte[] content) {
        try (PDDocument document = Loader.loadPDF(content)) {
            PDFTextStripper stripper = new PDFTextStripper();
            List<String> pages = new ArrayList<>();
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                pages.add(clean(stripper.getText(document)));
            }
            return pages;
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This PDF could not be read: " + e.getMessage());
        }
    }

    private List<String> fromText(String text) {
        return Arrays.stream(text.split(TEXT_PAGE_BREAK))
                .map(DocumentTextExtractor::clean)
                .filter(page -> !page.isBlank())
                .toList();
    }

    private static String clean(String text) {
        return text.replace("\r", "")
                .replaceAll("[ \\t]+", " ")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }
}
