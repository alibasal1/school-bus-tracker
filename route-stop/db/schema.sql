-- Route & Stop (Yehia). Run in Neon after school-bus-schedule-arrival db/auth-schema.sql.

CREATE TABLE routes (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  area VARCHAR(100) NOT NULL
);

CREATE TABLE stops (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id   UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  stop_order INT NOT NULL CHECK (stop_order > 0)
);

CREATE TABLE buses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number  VARCHAR(20) NOT NULL UNIQUE,
  route_id      UUID REFERENCES routes(id),
  supervisor_id UUID REFERENCES users(id)
);

CREATE TABLE trips (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id       UUID NOT NULL REFERENCES routes(id),
  bus_id         UUID REFERENCES buses(id),
  run_type       VARCHAR(10) NOT NULL CHECK (run_type IN ('morning', 'afternoon')),
  status         VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancelled_date DATE
);
