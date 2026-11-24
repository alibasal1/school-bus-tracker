// One Lambda function, three kinds of event:
//   1. A web request from API Gateway -> serverless-http turns it into an Express request (req).
//   2. The daily EventBridge schedule (source "aws.events") -> send tomorrow's holiday alerts.
//   3. Messages from the SQS alerts queue (Records from "aws:sqs") -> create the alerts.
// Before the first event we load the secrets (only once per cold start).
const serverless = require('serverless-http');
const { loadSecrets } = require('./config/secrets');

let ready = false;
let run;

// serverless-http 3 puts the raw request body on req.body as a Buffer. Express 5's
// express.json() then sees a body that is already there and leaves it alone, so
// every POST and PATCH reached the controllers with a Buffer and got a 400.
// Parse it here instead: JSON requests get the object, anything else gets no body,
// and the controllers still answer 415 / 400 exactly as they do outside Lambda.
function parseJsonBody(req) {
  if (!Buffer.isBuffer(req.body)) return;
  const text = req.body.toString('utf8');
  req.body = undefined;
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.includes('application/json') || !text) return;
  try {
    req.body = JSON.parse(text);
  } catch {
    req.body = undefined; // not JSON: the controller answers 400
  }
}

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

  if (!run) run = serverless(require('./app'), { request: parseJsonBody });
  return run(event, context);
};

module.exports.parseJsonBody = parseJsonBody;
