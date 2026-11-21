// serverless-http translates the Lambda event into an Express request (req),
// and the Express response (res) back into what Lambda returns.
const serverless = require('serverless-http');
const app = require('./app');
module.exports.handler = serverless(app);     // Lambda setting: handler = lambda.handler
