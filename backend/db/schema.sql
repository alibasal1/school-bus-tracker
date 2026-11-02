-- Run once in the Neon SQL Editor. Each block says which service owns the tables.

-- Shared: Signup / Login
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

-- Service 1: Route & Stop (Yehia)
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

-- Service 2: Schedule & Arrival (Ahmed)
CREATE TABLE trip_stops (
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  stop_id     UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  arrive_from TIME NOT NULL,
  arrive_to   TIME NOT NULL,
  PRIMARY KEY (trip_id, stop_id),
  CHECK (arrive_to > arrive_from)
);

CREATE TABLE students (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      VARCHAR(100) NOT NULL,
  parent_id UUID NOT NULL REFERENCES users(id),
  stop_id   UUID REFERENCES stops(id),
  bus_id    UUID REFERENCES buses(id)
);

CREATE TABLE attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  status     VARCHAR(20) NOT NULL CHECK (status IN ('boarded', 'almost_dropped', 'dropped')),
  marked_by  UUID REFERENCES users(id),
  marked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service 3: Favorites & Alerts (Ali)
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

-- Shared: logging
CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  event      VARCHAR(50) NOT NULL,
  status     INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
