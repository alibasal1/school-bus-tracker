// Route events from Yehia's Route & Stop service. Owner: Ali (246090).
//
// Yehia writes every trip change into his route_events outbox, and a forwarder
// Lambda publishes those rows to the SNS topic school-bus-route-events. This
// service's SQS queue is subscribed to that topic (raw message delivery), so the
// messages land in the same queue as the ones Ahmed sends by hand.
//
// They do not use this service's own message shape, so they are translated here:
//   { event_id, event_type: 'trip.cancelled', route_id, trip_id, occurred_at, payload }
//   ->  { type: 'cancel', routeId, message, eventId }
const EVENT_TYPES = {
  'trip.cancelled': 'cancel',
  'trip.created': 'trip_change'
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN = { morning: 'morning', afternoon: 'afternoon' };

// A route event is recognised by its event_type field, which this service's own
// messages never have.
function isRouteEvent(msg) {
  return Boolean(msg && typeof msg === 'object' && typeof msg.event_type === 'string');
}

function cut(text) {
  // The alerts table allows 300 characters.
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

function buildMessage(eventType, payload) {
  const route = payload.route_code ? `Route ${payload.route_code}` : 'Your route';
  const run = RUN[payload.run_type] || 'scheduled';
  const date = payload.service_date || 'today';

  if (eventType === 'trip.cancelled') {
    const reason = payload.reason ? ` Reason: ${payload.reason}` : '';
    return cut(`${route}: the ${run} trip on ${date} is cancelled.${reason}`);
  }
  return cut(`${route}: a ${run} trip has been scheduled for ${date}.`);
}

// Returns { message } on success, or { error } with the reason it was dropped.
function translate(msg) {
  const type = EVENT_TYPES[msg.event_type];
  if (!type) return { error: `route event ignored: unknown event_type ${msg.event_type}.` };
  if (!UUID.test(msg.event_id || '')) return { error: 'route event has no valid event_id.' };
  if (!UUID.test(msg.route_id || '')) return { error: 'route event has no valid route_id.' };

  const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
  return {
    message: {
      type,
      routeId: msg.route_id,
      message: buildMessage(msg.event_type, payload),
      eventId: msg.event_id,
      eventType: msg.event_type
    }
  };
}

module.exports = { isRouteEvent, translate };
