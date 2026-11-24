// Login checks for the Favorites & Alerts service.
// Login itself is built in school-bus-schedule-arrival (Ahmed). This service never sees a password:
// it gets a session token and checks it in the shared "sessions" table (same as the other services).
//   requireAuth -> who is this? No valid session: 401.
//   requireRole -> may this role do it? Wrong role: 403.
const { createHash } = require('crypto');
const sql = require('../db');

// Every refusal is written down here, so middleware/logger.js can log who was
// refused and why without each controller having to remember to do it.
function sendError(res, status, code, message) {
  res.locals.denyCode = code;
  return res.status(status).json({ error: { code, message } });
}

// The database keeps only a SHA-256 hash of the token, never the token itself.
function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function readToken(req) {
  const header = req.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (token.length < 20 || token.length > 512) return null;
  return token;
}

async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) return sendError(res, 401, 'UNAUTHENTICATED', 'Please log in.');

    const rows = await sql`
      SELECT s.user_id, s.expires_at, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${hashToken(token)}
      LIMIT 1
    `;
    const session = rows[0];
    // Same answer for "no session" and "expired", so nobody can probe which tokens exist.
    if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Your session has expired. Please log in again.');
    }

    req.user = { id: session.user_id, role: session.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'You do not have permission.');
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole, sendError, hashToken };
