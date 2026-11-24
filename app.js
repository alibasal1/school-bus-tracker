const express = require('express');
const cors = require('cors');
const logger = require('./middleware/logger');
const securityHeaders = require('./middleware/securityHeaders');

// Favorites & Alerts API. Owner: Ali (246090).
// app.js builds the Express app. It does not call app.listen():
//   server.js runs it on your PC, lambda.js runs it on AWS Lambda (Lab 7).
const app = express();

const allowed = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(logger);
app.use(express.json());
app.use(cors({ origin: allowed }));

app.get('/api/health', (req, res) => {
  // AWS sets AWS_LAMBDA_FUNCTION_NAME inside every Lambda function.
  const runtime = process.env.AWS_LAMBDA_FUNCTION_NAME ? 'lambda' : 'pc';
  res.status(200).json({ status: 'ok', service: 'favorites-alerts', runtime });
});

app.use('/api', require('./routes/favorites'));

app.use((req, res) => {
  res.locals.denyCode = 'ROUTE_NOT_FOUND';
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Endpoint not found.' } });
});

app.use((err, req, res, next) => {
  // Only our own message goes to the log, never the stack or the request body.
  console.error(err.message);
  res.locals.denyCode = 'INTERNAL_ERROR';
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
});

module.exports = app;
