-- Run once in the Neon SQL Editor, after db/schema.sql.
-- SNS and SQS both deliver at least once, so the same route event can arrive twice.
-- The event id is the idempotency key: the first delivery inserts the row and creates
-- the alerts, a repeat delivery hits the primary key and is skipped.
CREATE TABLE IF NOT EXISTS processed_events (
  event_id     UUID PRIMARY KEY,
  event_type   VARCHAR(40) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
