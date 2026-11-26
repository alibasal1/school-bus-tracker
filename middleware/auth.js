// Login checks for the Favorites & Alerts service.
// Login itself is built in school-bus-schedule-arrival (Ahmed). This service never sees a password:
// it gets a session token and checks it in the shared Sessions table in DynamoDB (same as Ahmed's service).
//   requireAuth -> who is this? No valid session: 401.
//   requireRole -> may this role do it? Wrong role: 403.
const { createHash } = require('crypto');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../db/dynamo');
const { TABLES } = require('../db/tables');

// Every refusal is written down here, so middleware/logger.js can log who was
// refused and why without each controller having to remember to do it.
function sendError(res, status, code, message) {
  res.locals.denyCode = code;
  return res.status(status).json({ error: { code, message } });
}

// The database keeps only a SHA-256 hash of the token, never the token itself.
// In Ahmed's Sessions table the item id IS this hash, so one GetItem finds it.
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

    const found = await db.send(new GetCommand({
      TableName: TABLES.sessions,
      Key: { id: hashToken(token) }
    }));
    const session = found.Item;
    // expires_at is Unix seconds (Ahmed's design).
    // Same answer for "no session" and "expired", so nobody can probe which tokens exist.
    if (!session || Number(session.expires_at) <= Math.floor(Date.now() / 1000)) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Your session has expired. Please log in again.');
    }

    const owner = await db.send(new GetCommand({
      TableName: TABLES.users,
      Key: { id: session.user_id }
    }));
    const user = owner.Item;
    // A session whose user was deleted is treated like no session at all.
    if (!user) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Your session has expired. Please log in again.');
    }

    req.user = { id: user.id, role: user.role, name: user.name };
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
