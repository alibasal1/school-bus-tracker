// Idempotency for events that arrive from another service. Owner: Ali (246090).
// SQS promises at-least-once delivery, so the same trip cancellation can reach
// this service twice. Claiming the event id first means the parents get one
// alert, not two. ProcessedEvents item: { event_id, event_type, processed_at }.
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../db/dynamo');
const { TABLES } = require('../db/tables');

// true  -> this event is new, go ahead and create the alerts
// false -> it was handled before, skip it
async function claimEvent(eventId, eventType) {
  try {
    await db.send(new PutCommand({
      TableName: TABLES.processedEvents,
      Item: { event_id: eventId, event_type: eventType, processed_at: new Date().toISOString() },
      // Only write when no item has this id yet. The check and the write are one step.
      ConditionExpression: 'attribute_not_exists(event_id)'
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

module.exports = { claimEvent };
