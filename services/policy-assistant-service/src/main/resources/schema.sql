-- Runs on every start (spring.sql.init.mode=always); every statement is safe to repeat.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS policy_documents (
    id            BIGSERIAL PRIMARY KEY,
    title         TEXT      NOT NULL,
    file_name     TEXT,
    policy_number TEXT,
    is_sample     BOOLEAN   NOT NULL DEFAULT FALSE,
    pages         INT       NOT NULL DEFAULT 0,
    chunks        INT       NOT NULL DEFAULT 0,
    uploaded_at   TIMESTAMP NOT NULL DEFAULT now()
);

-- One row per piece ("chunk") of a policy.
--   hash_embedding: built locally, always present, so search works even without an AI provider
--   embedding:      from the AI provider's embedding model (no fixed size: depends on the model)
CREATE TABLE IF NOT EXISTS policy_chunks (
    id              BIGSERIAL PRIMARY KEY,
    document_id     BIGINT  NOT NULL REFERENCES policy_documents (id) ON DELETE CASCADE,
    chunk_index     INT     NOT NULL,
    page            INT     NOT NULL,
    content         TEXT    NOT NULL,
    hash_embedding  vector(512) NOT NULL,
    embedding       vector,
    embedding_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_policy_chunks_document ON policy_chunks (document_id);
