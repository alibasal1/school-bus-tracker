# How to send an alert to parents (for Yehia and Ahmed)

The Favorites & Alerts service owns the `Alerts` table in DynamoDB. Your service
does not write to it and does not call Ali's code. You send one message to the
SQS queue `favorites-alerts-queue`. Ali's Lambda reads the queue and creates the alerts.

There is no SNS in between any more: you call `SendMessage` on the queue yourself.

## Queue

| | Value on Floci |
|---|---|
| Queue URL | `http://localhost:4566/000000000000/favorites-alerts-queue` |
| Queue ARN | `arn:aws:sqs:us-east-1:000000000000:favorites-alerts-queue` |
| Dead-letter queue | `favorites-alerts-dlq` (after 3 failed tries) |

`bash infra/deploy.sh` prints both at the end and saves them in `out/api-url.txt`.
Inside a Lambda on Floci, use the same queue name with your SDK client; on real
AWS the account number and region change.

## Permission (least privilege)

Your Lambda role needs this, and nothing else of mine:

```json
{
  "Effect": "Allow",
  "Action": "sqs:SendMessage",
  "Resource": "arn:aws:sqs:*:*:favorites-alerts-queue"
}
```

## Message shapes

### 1. Route events (Yehia)

Send the event as it is. `services/routeEvents.js` turns it into an alert for
every parent who saved that route.

```json
{
  "event_id": "44444444-4444-4444-8444-444444444444",
  "event_type": "trip.cancelled",
  "route_id": "route-cairo-demo",
  "payload": {
    "service_date": "2026-11-26",
    "run_type": "morning",
    "route_code": "CAI-DEMO",
    "reason": "Bus in the garage"
  }
}
```

| Field | Rule |
|---|---|
| `event_id` | required, unique per event. Letters, digits, `-`, `_`, `:` |
| `event_type` | `trip.cancelled` (becomes `cancel`) or `trip.created` (becomes `trip_change`) |
| `route_id` | the route id from the `Routes` table. It may also be inside `payload` |
| `payload` | optional: `service_date`, `run_type`, `route_code`, `reason` make the text nicer |

What a parent reads: `Route CAI-DEMO: the morning trip on 2026-11-26 is cancelled. Reason: Bus in the garage`

**Duplicates.** SQS delivers at least once, so the same event can arrive twice.
`event_id` is the idempotency key: `services/processedEvents.js` writes it to the
`ProcessedEvents` table with `attribute_not_exists(event_id)`. Only the first
delivery creates alerts; a repeat is logged as `already handled, skipped`.

### 2. One parent (Ahmed: attendance)

```json
{ "type": "boarding", "parentId": "<parent user id>", "message": "Omar boarded bus 12 at 07:14." }
```

`type` is `boarding`, `almost_dropped` or `dropped`.

### 3. Every parent of a route, own text

```json
{ "type": "cancel", "routeId": "<route id>", "message": "Route R1 morning trip is cancelled today." }
```

`type` is `cancel` or `trip_change`.

Rules for all shapes: `message` is 1 to 300 characters, ids use only letters,
digits, `-`, `_` and `:`. A bad message is logged and dropped (sending it again would
not fix it). If DynamoDB fails, the Lambda throws, SQS tries again, and after 3
tries the message moves to `favorites-alerts-dlq`.

## Send it from Node.js (your Lambda)

```js
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const sqs = new SQSClient({});

await sqs.send(new SendMessageCommand({
  QueueUrl: process.env.ALERTS_QUEUE_URL,
  MessageBody: JSON.stringify({ event_id, event_type: 'trip.cancelled', route_id, payload })
}));
```

## Test from Git Bash

```
export AWS_PROFILE=floci
QUEUE_URL=$(aws sqs get-queue-url --queue-name favorites-alerts-queue --query QueueUrl --output text)
aws sqs send-message --queue-url $QUEUE_URL --message-body file://infra/events/route-cancelled.json
aws sqs send-message --queue-url $QUEUE_URL --message-body file://infra/events/test-boarding-message.json
```

`route-cancelled.json` points at `test-route-1` from `scripts/seed-floci.js`.
Send it twice: the first call creates the alerts, the second creates nothing.
The result of this test is in `evidence/ST-09.txt`.
