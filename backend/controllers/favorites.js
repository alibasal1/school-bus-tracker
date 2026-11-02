// Favorites & Alerts controller. Owner: Ali (246090).
// Controllers check the request (400 on bad input) and call the service.
// They never write SQL. The service never sees req or res (Lab 4).
const service = require('../services/favorites');

function notBuilt(res) {
  return res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in a later sprint.' } });
}

// GET /api/favorites
async function listFavorites(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// POST /api/favorites
async function addFavorite(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/favorites/:id
async function removeFavorite(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// GET /api/alerts
async function listAlerts(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/alerts/:id
async function markAlertRead(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// GET /api/holidays
async function listHolidays(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listFavorites,
  addFavorite,
  removeFavorite,
  listAlerts,
  markAlertRead,
  listHolidays
};
