// Two logs, and neither one ever prints a password, a token or a request body.
//   1. One line per request: method, path, status, time.
//   2. A SECURITY line whenever a request is refused, saying who was refused and why.
//      Section 5 of the brief asks for "selected security-relevant actions" to be recorded;
//      these lines are what CloudWatch Logs Insights and the metric filter search for.
const DENIAL_STATUS = new Set([401, 403, 404, 409, 415, 429]);

function logger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    const ms = Date.now() - start;
    console.log(`${req.method} ${path} ${res.statusCode} ${ms}ms`);

    if (DENIAL_STATUS.has(res.statusCode) || res.statusCode >= 500) {
      // req.user is only set when requireAuth accepted a session, so "anonymous"
      // here means the token was missing, unknown or expired.
      const who = req.user ? `user=${req.user.id} role=${req.user.role}` : 'user=anonymous';
      const reason = res.locals.denyCode || 'UNHANDLED';
      console.log(`SECURITY denied ${req.method} ${path} status=${res.statusCode} reason=${reason} ${who}`);
    }
  });
  next();
}

module.exports = logger;
