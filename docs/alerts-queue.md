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
