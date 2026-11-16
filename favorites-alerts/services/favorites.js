// Favorites service. All SQL stays here and values are sent as parameters.
const sql = require('../db');
const alerts = require('./alerts');
const holidays = require('./holidays');

function cairoDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

function cairoTime() {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

async function listFavorites(userId) {
  const today = cairoDate();
  const currentTime = cairoTime();
  const todayHolidays = await holidays.getHolidays(Number(today.slice(0, 4)));
  const isHoliday = todayHolidays.some((holiday) => holiday.date === today);

  await alerts.ensureTomorrowHolidayAlert(userId);

  const rows = await sql`
    SELECT
      f.id,
      f.route_id AS "routeId",
      r.name AS "routeName",
      f.stop_id AS "stopId",
      s.name AS "stopName",
      next_stop.arrive_from AS "arrivalFrom",
      next_stop.arrive_to AS "arrivalTo"
    FROM favorites f
    JOIN routes r ON r.id = f.route_id
    LEFT JOIN stops s ON s.id = f.stop_id
    LEFT JOIN LATERAL (
      SELECT ts.arrive_from, ts.arrive_to
      FROM trip_stops ts
      JOIN trips t ON t.id = ts.trip_id
      WHERE ts.stop_id = f.stop_id
        AND t.route_id = f.route_id
        AND t.status = 'active'
        AND ts.arrive_to >= ${currentTime}::time
      ORDER BY ts.arrive_from
      LIMIT 1
    ) next_stop ON true
    WHERE f.user_id = ${userId}::uuid
    ORDER BY r.name, s.stop_order
  `;

  return rows.map((row) => ({
    ...row,
    arrivalFrom: isHoliday ? null : row.arrivalFrom,
    arrivalTo: isHoliday ? null : row.arrivalTo,
    noBusToday: isHoliday
  }));
}

async function addFavorite(userId, routeId, stopId) {
  const routes = await sql`SELECT id FROM routes WHERE id = ${routeId}::uuid`;
  if (routes.length === 0) return { error: 'NOT_FOUND' };

  if (stopId) {
    const stops = await sql`
      SELECT id
      FROM stops
      WHERE id = ${stopId}::uuid AND route_id = ${routeId}::uuid
    `;
    if (stops.length === 0) return { error: 'NOT_FOUND' };
  }

  const existing = await sql`
    SELECT id
    FROM favorites
    WHERE user_id = ${userId}::uuid
      AND route_id = ${routeId}::uuid
      AND stop_id IS NOT DISTINCT FROM ${stopId}::uuid
    LIMIT 1
  `;
  if (existing.length > 0) return { error: 'DUPLICATE' };

  try {
    const rows = await sql`
      INSERT INTO favorites (user_id, route_id, stop_id)
      VALUES (${userId}::uuid, ${routeId}::uuid, ${stopId}::uuid)
      RETURNING id, route_id AS "routeId", stop_id AS "stopId"
    `;
    return rows[0];
  } catch (err) {
    if (err.code === '23505') return { error: 'DUPLICATE' };
    throw err;
  }
}

async function removeFavorite(userId, favoriteId) {
  const rows = await sql`
    DELETE FROM favorites
    WHERE id = ${favoriteId}::uuid AND user_id = ${userId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}

module.exports = {
  listFavorites,
  addFavorite,
  removeFavorite
};
