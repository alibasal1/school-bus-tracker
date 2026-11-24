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

// Yehia's trips table gained service_date in his v2 migration. If this Neon
// database has not run that migration yet, Postgres answers 42703
// (undefined_column). Asking for the arrival without the date filter is better
// than a 500, so the page still works and only shows a wider time window.
const UNDEFINED_COLUMN = '42703';
let tripsHaveServiceDate = true;

async function listFavorites(userId) {
  const today = cairoDate();
  const currentTime = cairoTime();
  const todayHolidays = await holidays.getHolidays(Number(today.slice(0, 4)));
  const isHoliday = todayHolidays.some((holiday) => holiday.date === today);

  await alerts.ensureTomorrowHolidayAlert(userId);

  const rows = await favoritesWithArrival(userId, today, currentTime);

  return rows.map((row) => ({
    ...row,
    arrivalFrom: isHoliday ? null : row.arrivalFrom,
    arrivalTo: isHoliday ? null : row.arrivalTo,
    noBusToday: isHoliday
  }));
}

async function favoritesWithArrival(userId, today, currentTime) {
  if (tripsHaveServiceDate) {
    try {
      return await favoritesQuery(userId, today, currentTime, true);
    } catch (err) {
      if (err.code !== UNDEFINED_COLUMN) throw err;
      // Say it once, then stop trying the column on every request.
      console.error('trips.service_date is missing: showing arrivals without the date filter until the migration runs.');
      tripsHaveServiceDate = false;
    }
  }
  return favoritesQuery(userId, today, currentTime, false);
}

// The query is written twice on purpose. The neon() helper does not join SQL
// fragments, and the fallback has to leave the service_date column out of the
// text completely, not just skip its value.
function favoritesQuery(userId, today, currentTime, withServiceDate) {
  if (withServiceDate) {
    return sql`
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
          AND t.service_date = ${today}::date
          AND ts.arrive_to >= ${currentTime}::time
        ORDER BY ts.arrive_from
        LIMIT 1
      ) next_stop ON true
      WHERE f.user_id = ${userId}::uuid
      ORDER BY r.name, s.stop_order
    `;
  }

  return sql`
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

// Every active route with its stops, so the Save a stop form has something to
// show. The form used to read Yehia's API directly: going through this service
// means my page still works when his API is down, and the parent only ever
// talks to one address.
//
// routes.is_active comes with Yehia's newer schema. A Neon database that does
// not have it yet answered this request with a 500 (42703, undefined_column),
// which left the form empty. Same fix as service_date above: try the column,
// and if it is missing, say so once and list every route instead.
let routesHaveIsActive = true;

async function optionRows() {
  if (routesHaveIsActive) {
    try {
      return await sql`
        SELECT
          r.id   AS "routeId",
          r.code AS "routeCode",
          r.name AS "routeName",
          s.id   AS "stopId",
          s.name AS "stopName",
          s.stop_order AS "stopOrder"
        FROM routes r
        LEFT JOIN stops s ON s.route_id = r.id
        WHERE r.is_active = TRUE
        ORDER BY r.code, s.stop_order
      `;
    } catch (err) {
      if (err.code !== UNDEFINED_COLUMN) throw err;
      console.error('routes.is_active is missing: listing every route until the migration runs.');
      routesHaveIsActive = false;
    }
  }
  return sql`
    SELECT
      r.id   AS "routeId",
      r.code AS "routeCode",
      r.name AS "routeName",
      s.id   AS "stopId",
      s.name AS "stopName",
      s.stop_order AS "stopOrder"
    FROM routes r
    LEFT JOIN stops s ON s.route_id = r.id
    ORDER BY r.code, s.stop_order
  `;
}

async function listOptions() {
  const rows = await optionRows();

  // One row per stop comes back; the form wants one entry per route.
  const byRoute = new Map();
  for (const row of rows) {
    if (!byRoute.has(row.routeId)) {
      byRoute.set(row.routeId, {
        id: row.routeId,
        code: row.routeCode,
        name: row.routeName,
        stops: []
      });
    }
    if (row.stopId) {
      byRoute.get(row.routeId).stops.push({
        id: row.stopId,
        name: row.stopName,
        stopOrder: row.stopOrder
      });
    }
  }
  return [...byRoute.values()];
}

module.exports = {
  listFavorites,
  listOptions,
  addFavorite,
  removeFavorite
};
