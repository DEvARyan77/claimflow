-- Runs once, the first time the Postgres container starts with an empty volume.
-- One database per service: no service can read another service's tables.
CREATE DATABASE patient_db;
CREATE DATABASE provider_db;
CREATE DATABASE claims_db;
CREATE DATABASE payment_db;
CREATE DATABASE notification_db;
CREATE DATABASE policy_db;

-- The policy assistant stores embeddings with the pgvector extension
\connect policy_db
CREATE EXTENSION IF NOT EXISTS vector;
