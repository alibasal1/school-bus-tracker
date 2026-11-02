// Schedule & Arrival controller. Owner: Ahmed (230102).
// Controllers check the request (400 on bad input) and call the service.
// They never write SQL. The service never sees req or res (Lab 4).
const service = require('../services/schedule');

function notBuilt(res) {
  return res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in a later sprint.' } });
}

// PUT /api/trips/:id/times
async function setStopTimes(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// GET /api/trips/:id/eta
async function getEta(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// POST /api/students
async function linkStudent(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// POST /api/trips/:id/attendance
async function markAttendance(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/attendance/:id
async function fixAttendance(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

// GET /api/trips/:id/attendance
async function viewAttendance(req, res, next) {
  try {
    return notBuilt(res);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  setStopTimes,
  getEta,
  linkStudent,
  markAttendance,
  fixAttendance,
  viewAttendance
};
