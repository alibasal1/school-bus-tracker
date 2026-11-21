// One Lambda function, three kinds of event:
//   1. A web request from API Gateway -> serverless-http turns it into an Express request (req).
//   2. The daily EventBridge schedule (source "aws.events") -> send tomorrow's holiday alerts.
//   3. Messages from the SQS alerts queue (Records from "aws:sqs") -> create the alerts.
// Before the first event we load the secrets (only once per cold start).
const serverless = require('serverless-http');
const { loadSecrets } = require('./config/secrets');

let ready = false;
let run;

module.exports.handler = async (event, context) => {   // Lambda setting: handler = lambda.handler
  if (!ready) {
    await loadSecrets();
    ready = true;
  }

  if (event && event.source === 'aws.events') {
    const alerts = require('./services/alerts');
    const result = await alerts.sendHolidayAlertsToAllParents();
    console.log(`Daily holiday job: ${result.parents} parents checked, ${result.sent} holiday alerts`);
    return result;
  }

  if (event && Array.isArray(event.Records) && event.Records[0]?.eventSource === 'aws:sqs') {
    const { handleQueueMessage } = require('./services/alertsQueue');
    let created = 0;
    for (const record of event.Records) created += await handleQueueMessage(record.body);
    console.log(`Alerts queue: ${event.Records.length} messages, ${created} alerts created`);
    return { messages: event.Records.length, created };
  }

  if (!run) run = serverless(require('./app'));
  return run(event, context);
};
