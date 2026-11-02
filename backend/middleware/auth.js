// Shared login checks. Owner: whole team (Signup / Login).
// requireAuth  -> 401 if there is no valid session token.
// requireRole  -> 403 if the user's role is not allowed.

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

async function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return sendError(res, 401, 'UNAUTHENTICATED', 'Please log in.');

  // TODO (Sprint 1): hash the token, find it in the sessions table,
  // check expires_at, then load the user and set req.user = { id, role }.
  return sendError(res, 401, 'UNAUTHENTICATED', 'Login is not built yet.');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'You do not have permission.');
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, sendError };
