// Alerts queue (Amazon SQS). Owner: Ali (246090).
// Yehia (Route & Stop) and Ahmed (Schedule & Arrival) do not call this code directly:
// they send a message to the queue, and Lambda runs handleQueueMessage for each one.
//
// Message for one parent (Ahmed: boarding, almost_dropped, dropped):
//   { "type": "boarding", "parentId": "<uuid>", "message": "Omar boarded bus 12 at 07:14." }
// Message for every parent who saved a route (Yehia: cancel, trip_change):
//   { "type": "cancel", "routeId": "<uuid>", "message": "Route R1 morning trip is cancelled today." }
const alerts = require('./alerts');
const routeEvents = require('./routeEvents');
const processedEvents = require('./processedEvents');

const PARENT_TYPES = ['boarding', 'almost_dropped', 'dropped'];
const ROUTE_TYPES = ['cancel', 'trip_change'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns an error text, or null if the message is valid.
function checkMessage(msg) {
  if (!msg || typeof msg !== 'object') return 'Message must be a JSON object.';
  if (typeof msg.message !== 'string' || msg.message.trim().length === 0 || msg.message.length > 300) {
    return 'message must be 1 to 300 characters.';
  }
  if (PARENT_TYPES.includes(msg.type)) {
    return UUID.test(msg.parentId || '') ? null : 'parentId must be a UUID.';
  }
  if (ROUTE_TYPES.includes(msg.type)) {
    return UUID.test(msg.routeId || '') ? null : 'routeId must be a UUID.';
  }
  return `type must be one of: ${PARENT_TYPES.concat(ROUTE_TYPES).join(', ')}.`;
}

// A bad message is logged and dropped (sending it again will not fix it).
// A database error is thrown, so SQS tries again, and after 3 tries moves it to the dead-letter queue.
async function handleQueueMessage(body) {
  let msg;
  try {
    msg = JSON.parse(body);
  } catch {
    console.error('Alerts queue: dropped a message that is not JSON.');
    return 0;
  }

  // Yehia's service does not speak this service's message shape: its events
  // arrive from the SNS topic and are translated first. The event id keeps a
  // repeated delivery from creating the same alerts twice.
  let eventId = null;
  if (routeEvents.isRouteEvent(msg)) {
    const translated = routeEvents.translate(msg);
    if (translated.error) {
      console.error(`Alerts queue: dropped a route event. ${translated.error}`);
      return 0;
    }
    eventId = translated.message.eventId;
    const isNew = await processedEvents.claimEvent(eventId, translated.message.eventType);
    if (!isNew) {
      console.log(`Alerts queue: route event ${eventId} was already handled, skipped.`);
      return 0;
    }
    msg = translated.message;
  }

  const problem = checkMessage(msg);
  if (problem) {
    console.error(`Alerts queue: dropped a bad message. ${problem}`);
    return 0;
  }

  const text = msg.message.trim();
  if (PARENT_TYPES.includes(msg.type)) {
    await alerts.createAlert(msg.parentId, msg.type, text);
    return 1;
  }
  const created = await alerts.createAlertsForRoute(msg.routeId, msg.type, text);
  return created.length;
}

module.exports = { checkMessage, handleQueueMessage };
