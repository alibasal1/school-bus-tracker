// Favorites service. All DynamoDB calls for favorites stay here.
// Favorites item (Ahmed's design): { id, user_id, route_id, stop_id, created_at }.
// stop_id is left out when the parent saved the whole route.
const { randomUUID } = require('crypto');
const { GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../db/dynamo');
const { queryAll, scanAll } = require('../db/pages');
const { TABLES } = require('../db/tables');
const alerts = require('./alerts');
const holidays = require('./holidays');

function cairoDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

// "07:14", the same format as arrive_from / arrive_to in TripStops.
function cairoTime() {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

async function getItem(TableName, Key) {
  const result = await db.send(new GetCommand({ TableName, Key }));
  return result.Item || null;
}

function userFavorites(userId) {
  return queryAll({
    TableName: TABLES.favorites,
    IndexName: 'user-id-index',
    KeyConditionExpression: 'user_id = :user',
    ExpressionAttributeValues: { ':user': userId }
  });
}

// Is this trip running today (Cairo date)?
// Ahmed's trips run every school day and have cancelled_date for a one-day
// cancellation. A trip that also has a date field runs on that date only.
function runsToday(trip, today) {
  if (trip.date && trip.date !== today) return false;
  return true;
}

function cancelledToday(trip, today) {
  return trip.status === 'cancelled' || trip.cancelled_date === today;
}

// The next bus for one saved stop: today's trips on the route, then the
// TripStops row for this stop, keeping the earliest window that has not ended.
async function nextArrival(favorite, today, now) {
  if (!favorite.stop_id) return { arrivalFrom: null, arrivalTo: null, tripStatus: null };

  const trips = (await queryAll({
    TableName: TABLES.trips,
    IndexName: 'route-id-index',
    KeyConditionExpression: 'route_id = :route',
    ExpressionAttributeValues: { ':route': favorite.route_id }
  })).filter((trip) => runsToday(trip, today));

  let best = null;
  let anyCancelled = false;
  for (const trip of trips) {
    if (cancelledToday(trip, today)) {
      anyCancelled = true;
      continue;
    }
    const stop = await getItem(TABLES.tripStops, { trip_id: trip.id, stop_id: favorite.stop_id });
    if (!stop || !stop.arrive_from || !stop.arrive_to || stop.arrive_to < now) continue;
    if (!best || stop.arrive_from < best.arrivalFrom) {
      best = { arrivalFrom: stop.arrive_from, arrivalTo: stop.arrive_to, tripStatus: trip.status || null };
    }
  }
  if (best) return best;
  return { arrivalFrom: null, arrivalTo: null, tripStatus: anyCancelled ? 'cancelled' : null };
}

async function listFavorites(userId) {
  const today = cairoDate();
  const now = cairoTime();
  const todayHolidays = await holidays.getHolidays(Number(today.slice(0, 4)));
  const isHoliday = todayHolidays.some((holiday) => holiday.date === today);

  await alerts.ensureTomorrowHolidayAlert(userId);

  const saved = await userFavorites(userId);
  const rows = [];
  for (const favorite of saved) {
    const route = await getItem(TABLES.routes, { id: favorite.route_id });
    const stop = favorite.stop_id ? await getItem(TABLES.stops, { id: favorite.stop_id }) : null;
    const arrival = isHoliday
      ? { arrivalFrom: null, arrivalTo: null, tripStatus: null }
      : await nextArrival(favorite, today, now);
    rows.push({
      id: favorite.id,
      routeId: favorite.route_id,
      routeName: route ? route.name : 'Unknown route',
      stopId: favorite.stop_id || null,
      stopName: stop ? stop.name : null,
      stopOrder: stop ? Number(stop.stop_order) : 0,
      ...arrival,
      noBusToday: isHoliday
    });
  }

  rows.sort((a, b) => a.routeName.localeCompare(b.routeName) || a.stopOrder - b.stopOrder);
  return rows.map(({ stopOrder, ...row }) => row);
}

async function addFavorite(userId, routeId, stopId) {
  const route = await getItem(TABLES.routes, { id: routeId });
  if (!route) return { error: 'NOT_FOUND' };

  if (stopId) {
    const stop = await getItem(TABLES.stops, { id: stopId });
    if (!stop || stop.route_id !== routeId) return { error: 'NOT_FOUND' };
  }

  // One parent, one route, one stop (or the whole route) only once.
  const existing = await userFavorites(userId);
  const duplicate = existing.some((item) => item.route_id === routeId && (item.stop_id || null) === stopId);
  if (duplicate) return { error: 'DUPLICATE' };

  const item = {
    id: randomUUID(),
    user_id: userId,
    route_id: routeId,
    stop_id: stopId || undefined,
    created_at: new Date().toISOString()
  };
  await db.send(new PutCommand({
    TableName: TABLES.favorites,
    Item: item,
    ConditionExpression: 'attribute_not_exists(id)'
  }));
  return { id: item.id, routeId, stopId };
}

// The condition makes DynamoDB check the owner in the same request as the
// delete: another parent's favorite (or a missing id) is not deleted, and the
// caller answers 404.
async function removeFavorite(userId, favoriteId) {
  try {
    await db.send(new DeleteCommand({
      TableName: TABLES.favorites,
      Key: { id: favoriteId },
      ConditionExpression: 'user_id = :user',
      ExpressionAttributeValues: { ':user': userId }
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

// Every route with its stops, so the Save a stop form has something to show.
// Going through this service means the page still works when the Route & Stop
// API is down, and the parent only ever talks to one address.
async function listOptions() {
  const [routes, stops] = await Promise.all([
    scanAll({ TableName: TABLES.routes }),
    scanAll({ TableName: TABLES.stops })
  ]);

  const byRoute = new Map(routes.map((route) => [route.id, {
    id: route.id,
    code: route.code,
    name: route.name,
    stops: []
  }]));
  for (const stop of stops) {
    const route = byRoute.get(stop.route_id);
    if (route) route.stops.push({ id: stop.id, name: stop.name, stopOrder: Number(stop.stop_order) });
  }
  for (const route of byRoute.values()) route.stops.sort((a, b) => a.stopOrder - b.stopOrder);
  return [...byRoute.values()].sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

module.exports = {
  listFavorites,
  listOptions,
  addFavorite,
  removeFavorite
};
