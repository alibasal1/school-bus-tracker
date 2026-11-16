-- Shared login tables. Owner: Ahmed (Signup / Login lead).
-- Run this FIRST in Neon, before any service schema.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'supervisor', 'parent')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  event      VARCHAR(50) NOT NULL,
  status     INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
