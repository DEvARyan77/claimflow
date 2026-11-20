package com.claimflow.policy.web;

import com.claimflow.policy.config.AiSettings;
import com.claimflow.policy.dto.Dtos.Answer;
import com.claimflow.policy.dto.Dtos.AskRequest;
import com.claimflow.policy.dto.Dtos.AssistantStatus;
import com.claimflow.policy.dto.Dtos.DocumentSummary;
import com.claimflow.policy.dto.Dtos.PrecheckRequest;
import com.claimflow.policy.profile.ProfileExtractor;
import com.claimflow.policy.rag.PolicyAssistantService;
import com.claimflow.policy.rag.PolicyIngestionService;
import com.claimflow.policy.rag.PolicyRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/policies")
@RequiredArgsConstructor
public class PolicyController {

    private final PolicyRepository repository;
    private final PolicyIngestionService ingestionService;
    private final PolicyAssistantService assistantService;
    private final AiSettings aiSettings;
    private final ProfileExtractor profileExtractor;

    @GetMapping
    public List<DocumentSummary> list() {
        return repository.findAllDocuments();
    }

    @GetMapping("/{id}")
    public DocumentSummary get(@PathVariable long id) {
        return repository.findDocument(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Policy document " + id + " not found"));
    }

    /** Upload a policy (PDF or .txt). Form fields: file, title (optional), policyNumber (optional). */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentSummary> upload(@RequestParam("file") MultipartFile file,
                                                  @RequestParam(value = "title", required = false) String title,
                                                  @RequestParam(value = "policyNumber", required = false) String policyNumber)
            throws IOException {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The file is empty");
        }
        String name = file.getOriginalFilename() == null ? "policy" : file.getOriginalFilename();
        String documentTitle = title == null || title.isBlank() ? name.replaceAll("\\.[^.]+$", "") : title.trim();
        DocumentSummary saved = ingestionService.ingest(documentTitle, name, policyNumber, file.getBytes(), false);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        if (!repository.deleteUploadedDocument(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No uploaded document " + id + " (the sample can't be deleted)");
        }
        return ResponseEntity.noContent().build();
    }

    /**
     * "Auto-pickup": send a policy PDF or a photo of it, get back the policy holder's details
     * (name, email, phone, policy number, sum insured) to pre-fill a new profile. Nothing is saved here.
     */
    @PostMapping(value = "/extract-profile", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ProfileExtractor.ExtractedProfile extractProfile(@RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The file is empty");
        }
        return profileExtractor.extract(file.getOriginalFilename(), file.getContentType(), file.getBytes());
    }

    /** Ask anything about a policy. */
    @PostMapping("/ask")
    public Answer ask(@Valid @RequestBody AskRequest request) {
        return assistantService.ask(request);
    }

    /** "Will this claim be covered?" before submitting it. */
    @PostMapping("/precheck")
    public Answer precheck(@Valid @RequestBody PrecheckRequest request) {
        return assistantService.precheck(request);
    }

    @GetMapping("/assistant/status")
    public AssistantStatus status() {
        return new AssistantStatus(
                aiSettings.getProvider(),
                aiSettings.isEnabled(),
                aiSettings.isEnabled() ? aiSettings.getChatModel() : null,
                aiSettings.isEnabled() ? aiSettings.getEmbeddingModel() : "local-hash-512",
                repository.countDocuments(),
                repository.countChunks(),
                aiSettings.isEnabled() ? repository.countChunksWithoutModelEmbedding(aiSettings.getEmbeddingModel()) : 0);
    }
}
