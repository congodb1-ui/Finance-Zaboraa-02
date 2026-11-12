-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240001000000_extensions.sql
-- Description: Enable core PostgreSQL extensions required for UUID generation,
--              timestamp management (moddatetime), and cryptographic hashing/encryption.
-- ==============================================================================

-- 1. UUID Generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Automatic updated_at trigger helper
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- 3. Cryptographic utilities (SHA-256 for statement dedup, encryption at rest)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
