// One Lambda function, two kinds of event:
//   1. A web request from API Gateway -> serverless-http turns it into an Express request (req).
//   2. The daily EventBridge schedule (source "aws.events") -> send tomorrow's holiday alerts.
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

  if (!run) run = serverless(require('./app'));
  return run(event, context);
};
