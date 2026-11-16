// Signup / Login controller. Owner: Whole team.
// Controllers check the request (400 on bad input) and call the service.
// They never write SQL. The service never sees req or res (Lab 4).
const service = require('../services/auth');

function notBuilt(res) {
  return res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in a later sprint.' } });
}

// POST /api/users
async function register(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// POST /api/sessions
async function login(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/sessions/current
async function logout(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// POST /api/supervisors
async function createSupervisor(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  createSupervisor
};
