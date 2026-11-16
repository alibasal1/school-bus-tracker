// Route & Stop controller. Owner: Yehia (247330).
// Controllers check the request (400 on bad input) and call the service.
// They never write SQL. The service never sees req or res (Lab 4).
const service = require('../services/routes');

function notBuilt(res) {
  return res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in a later sprint.' } });
}

// GET /api/routes
async function listRoutes(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// POST /api/routes
async function createRoute(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// PUT /api/routes/:id
async function updateRoute(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/routes/:id
async function deleteRoute(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// POST /api/routes/:id/stops
async function addStop(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// PUT /api/stops/:id
async function updateStop(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/stops/:id
async function deleteStop(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// POST /api/buses
async function createBus(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// GET /api/trips
async function listTrips(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// POST /api/trips
async function createTrip(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/trips/:id/status
async function cancelTrip(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  addStop,
  updateStop,
  deleteStop,
  createBus,
  listTrips,
  createTrip,
  cancelTrip
};
