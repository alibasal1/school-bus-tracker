// Idempotency for events that arrive from another service. Owner: Ali (246090).
// SNS and SQS promise at-least-once delivery, so the same trip cancellation can
// reach this service twice. Claiming the event id first means the parents get
// one alert, not two.
const sql = require('../db');

// true  -> this event is new, go ahead and create the alerts
// false -> it was handled before, skip it
async function claimEvent(eventId, eventType) {
  const rows = await sql`
    INSERT INTO processed_events (event_id, event_type)
    VALUES (${eventId}::uuid, ${eventType})
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `;
  return rows.length > 0;
}

module.exports = { claimEvent };
