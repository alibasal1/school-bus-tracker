// App-level rate limiting, written like Lab 8's isRateLimited(): no library,
// a Map of client -> the times of its recent requests, and a 60-second window.
//
// This is the second layer. API Gateway stage throttling (infra/deploy.sh) is the
// first, and on real AWS it is the shared limit for the whole API. Floci stores
// that throttle but does not enforce it, so without this layer no 429 ever appears.
//
// Each Lambda copy keeps its own Map, so this limit is per copy: with three warm
// copies a client could in theory get three times the limit. That is why the
// API Gateway throttle stays on as the shared limit.
const WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 60;

const hits = new Map(); // client key -> [time of each counted request, oldest first]

// RATE_LIMIT_MAX comes from the secret favorites-alerts/app (config/secrets.js
// copies it into process.env at cold start) or from .env on the PC. Read on every
// request, so a missing or bad value simply means the default.
function maxPerWindow() {
  const value = Number(process.env.RATE_LIMIT_MAX);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX;
}

// Who is the client? Never X-Forwarded-For: anyone can send that header with a
// new fake address on every request (Lab 8 test S3) and never be limited.
// On Lambda the address comes from API Gateway itself, which the caller cannot set.
// On the PC there is no API Gateway, so the TCP connection's address is used.
function clientKey(req) {
  const sourceIp = req.apiGateway?.event?.requestContext?.http?.sourceIp;
  return sourceIp || req.socket?.remoteAddress || 'unknown';
}

// Returns 0 when the request may go on, or the number of seconds to wait.
// Refused requests are not counted, so a client that keeps hammering does not
// push its own wait further and further away.
function isRateLimited(key, now = Date.now(), max = maxPerWindow()) {
  const recent = (hits.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000));
  }
  recent.push(now);
  hits.set(key, recent);
  return 0;
}

// Drop clients with no request in the last window, so the Map cannot grow forever.
// unref() means this timer never keeps Node (or a Jest run) alive on its own.
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) {
    if (times.every((time) => now - time >= WINDOW_MS)) hits.delete(key);
  }
}, WINDOW_MS).unref();

function rateLimit(req, res, next) {
  if (req.path === '/api/health') return next();

  const wait = isRateLimited(clientKey(req));
  if (wait === 0) return next();

  // middleware/logger.js turns this into a SECURITY line with reason=RATE_LIMITED.
  // It logs the method, path and user only, never the token.
  res.locals.denyCode = 'RATE_LIMITED';
  res.set('Retry-After', String(wait));
  return res.status(429).json({
    error: { code: 'RATE_LIMITED', message: `Too many requests. Try again in ${wait} seconds.` }
  });
}

module.exports = rateLimit;
module.exports.isRateLimited = isRateLimited;
module.exports.clientKey = clientKey;
