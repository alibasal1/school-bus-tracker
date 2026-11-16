-- Schedule & Arrival (Ahmed). Run in Neon after school-bus-route-stop db/schema.sql.

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
