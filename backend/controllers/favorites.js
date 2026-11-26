// Controllers validate requests and choose responses; services own SQL.
const favorites = require('../services/favorites');
const alerts = require('../services/alerts');
const holidays = require('../services/holidays');
const { sendError } = require('../middleware/auth');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function hasJsonBody(req, res) {
  if (!req.is('application/json')) {
    sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
    return false;
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    sendError(res, 400, 'VALIDATION_ERROR', 'A JSON object is required.');
    return false;
  }
  return true;
}

async function listFavorites(req, res, next) {
  try {
    const rows = await favorites.listFavorites(req.user.id);
    return res.status(200).json({ favorites: rows });
  } catch (err) {
    return next(err);
  }
}

async function addFavorite(req, res, next) {
  if (!hasJsonBody(req, res)) return undefined;
  const { routeId, stopId = null } = req.body;
  if (!validUuid(routeId) || (stopId !== null && !validUuid(stopId))) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'routeId and stopId must be valid UUIDs.');
  }

  try {
    const favorite = await favorites.addFavorite(req.user.id, routeId, stopId);
    if (favorite.error === 'DUPLICATE') {
      return sendError(res, 409, 'DUPLICATE', 'This favorite already exists.');
    }
    if (favorite.error === 'NOT_FOUND') {
      return sendError(res, 404, 'NOT_FOUND', 'The route or stop was not found.');
    }
    return res.status(201).json({ favorite });
  } catch (err) {
    return next(err);
  }
}

async function removeFavorite(req, res, next) {
  if (!validUuid(req.params.id)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Favorite id must be a valid UUID.');
  }
  try {
    const removed = await favorites.removeFavorite(req.user.id, req.params.id);
    if (!removed) return sendError(res, 404, 'NOT_FOUND', 'Favorite not found.');
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

async function listAlerts(req, res, next) {
  let unread;
  if (req.query.unread !== undefined) {
    if (req.query.unread !== 'true' && req.query.unread !== 'false') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'unread must be true or false.');
    }
    unread = req.query.unread === 'true';
  }

  try {
    await alerts.ensureTomorrowHolidayAlert(req.user.id);
    const rows = await alerts.listAlerts(req.user.id, unread);
    return res.status(200).json({ alerts: rows });
  } catch (err) {
    return next(err);
  }
}

async function markAlertRead(req, res, next) {
  if (!validUuid(req.params.id)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Alert id must be a valid UUID.');
  }
  if (!hasJsonBody(req, res)) return undefined;
  if (req.body.isRead !== true) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'isRead must be true.');
  }

  try {
    const alert = await alerts.markAlertRead(req.user.id, req.params.id);
    if (!alert) return sendError(res, 404, 'NOT_FOUND', 'Alert not found.');
    return res.status(200).json({ alert });
  } catch (err) {
    return next(err);
  }
}

async function listHolidays(req, res, next) {
  const value = req.query.year;
  const cairoYear = Number(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 4)
  );
  const year = value === undefined ? cairoYear : Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'year must be a whole number from 2000 to 2100.');
  }

  try {
    const rows = await holidays.getHolidays(year);
    return res.status(200).json({ holidays: rows });
  } catch (err) {
    return next(err);
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
