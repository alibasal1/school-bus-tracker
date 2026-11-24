-- Favorites & Alerts (Ali). Run in Neon after the other two services.

CREATE TABLE favorites (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id  UUID REFERENCES stops(id) ON DELETE CASCADE,
  UNIQUE (user_id, route_id, stop_id)
);

CREATE TABLE alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL CHECK (type IN ('trip_change', 'cancel', 'boarding', 'almost_dropped', 'dropped', 'holiday')),
  message    VARCHAR(300) NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE holidays (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  year INT NOT NULL CHECK (year BETWEEN 2000 AND 2100)
);

-- Idempotency keys for route events arriving from Yehia's SNS topic.
-- Also shipped as db/migrations/001_processed_events.sql for databases already created.
CREATE TABLE processed_events (
  event_id     UUID PRIMARY KEY,
  event_type   VARCHAR(40) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
