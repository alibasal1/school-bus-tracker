# How to send an alert to parents (for Yehia and Ahmed)

The Favorites & Alerts service owns the `alerts` table. Your service does not write to it and
does not call Ali's code. You send one message to the SQS queue `favorites-alerts-queue`.
Ali's Lambda reads the queue and creates the alerts.

## The message

One parent (Ahmed: attendance):
```json
{ "type": "boarding", "parentId": "<parent user uuid>", "message": "Omar boarded bus 12 at 07:14." }
```
`type` is `boarding`, `almost_dropped` or `dropped`.

Every parent who saved a route (Yehia: trips):
```json
{ "type": "cancel", "routeId": "<route uuid>", "message": "Route R1 morning trip is cancelled today." }
```
`type` is `cancel` or `trip_change`.

Rules: `message` is 1 to 300 characters. Ids are UUIDs. A bad message is dropped and logged.
If the database is down, SQS tries 3 times, then moves the message to `favorites-alerts-dlq`.

## Send it from Node.js (your Lambda)

```js
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const sqs = new SQSClient({});

await sqs.send(new SendMessageCommand({
  QueueUrl: process.env.ALERTS_QUEUE_URL,
  MessageBody: JSON.stringify({ type: 'boarding', parentId, message }),
}));
```

Set `ALERTS_QUEUE_URL` on your Lambda. Ali's `bash infra/deploy.sh` prints it at the end.

## Permission (least privilege)

Add this to your Lambda role's policy. It allows sending to this one queue only:
```json
{
  "Effect": "Allow",
  "Action": "sqs:SendMessage",
  "Resource": "arn:aws:sqs:*:*:favorites-alerts-queue"
}
```

## Test from Git Bash

```
QUEUE_URL=$(aws sqs get-queue-url --queue-name favorites-alerts-queue --query QueueUrl --output text)
aws sqs send-message --queue-url $QUEUE_URL --message-body file://infra/events/test-boarding-message.json
```

## Route events from the Route & Stop service (added 24/11)

Yehia's service never calls this one directly. It writes every trip change into
its own `route_events` outbox in the same transaction as the change, and a
forwarder Lambda publishes those rows to the SNS topic `school-bus-route-events`.
This service's queue is subscribed to that topic, so the event arrives in the
same SQS queue as the messages Ahmed sends.

```
admin cancels a trip
  -> route_events row (same transaction)
  -> forwarder Lambda
  -> SNS school-bus-route-events
  -> SQS favorites-alerts-queue        (raw message delivery)
  -> this Lambda: services/routeEvents.js translates it
  -> alerts for every parent who saved that route
```

The events do not use this service's message shape, so `services/routeEvents.js`
translates them:

| Event from Yehia | Becomes | Message a parent reads |
|---|---|---|
| `trip.cancelled` | `cancel` | Route R1: the morning trip on 2026-11-24 is cancelled. Reason: ... |
| `trip.created` | `trip_change` | Route R1: a morning trip has been scheduled for 2026-11-24. |

Anything else (an unknown `event_type`, a missing `event_id` or `route_id`) is
logged and dropped, because sending it again would not fix it.

**Duplicates.** SNS and SQS both deliver at least once, so the same cancellation
can arrive twice. The `event_id` is the idempotency key: `services/processedEvents.js`
inserts it into `processed_events` and only the delivery that wins the primary key
creates the alerts. Run `db/migrations/001_processed_events.sql` in Neon once.

Test it by hand, after putting a real route id in the file:

```
aws sqs send-message --queue-url $(grep QUEUE_URL out/api-url.txt | cut -d= -f2-) \
  --message-body file://infra/events/route-cancelled.json
```

Send it twice: the first call creates the alerts, the second writes
`route event ... was already handled, skipped` in the log and creates nothing.
