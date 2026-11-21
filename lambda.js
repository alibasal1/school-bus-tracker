// serverless-http translates the Lambda event into an Express request (req),
// and the Express response (res) back into what Lambda returns.
// Before the first request we load the secrets, then build the app (only once per cold start).
const serverless = require('serverless-http');
const { loadSecrets } = require('./config/secrets');

let run;

module.exports.handler = async (event, context) => {   // Lambda setting: handler = lambda.handler
  if (!run) {
    await loadSecrets();
    run = serverless(require('./app'));
  }
  return run(event, context);
};
