// Alerts service. Callers provide IDs and messages, never request/response objects.
// Alerts item (Ahmed's design): { id, user_id, type, message, is_read, created_at }.
const { randomUUID } = require('crypto');
const { PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../db/dynamo');
const { queryAll, scanAll } = require('../db/pages');
const { TABLES } = require('../db/tables');
const holidays = require('./holidays');

// The API answers in camelCase, the table stores snake_case.
function toAlert(item) {
  return {
    id: item.id,
    type: item.type,
    message: item.message,
    isRead: item.is_read === true,
    createdAt: item.created_at
  };
}

async function createAlert(userId, type, message) {
  const item = {
    id: randomUUID(),
    user_id: userId,
    type,
    message,
    is_read: false,
    created_at: new Date().toISOString()
  };
  await db.send(new PutCommand({
    TableName: TABLES.alerts,
    Item: item,
    ConditionExpression: 'attribute_not_exists(id)'
  }));
  return toAlert(item);
}

// Every parent who saved this route gets the alert.
// A Scan reads the whole Favorites table and keeps the rows for this route.
// That is fine here because the table is small (a few favorites per parent);
// with many thousands of rows a route-id index on Favorites would be better.
async function createAlertsForRoute(routeId, type, message) {
  const rows = await scanAll({
    TableName: TABLES.favorites,
    FilterExpression: 'route_id = :route',
    ExpressionAttributeValues: { ':route': routeId },
    ProjectionExpression: 'user_id'
  });
  const parents = [...new Set(rows.map((row) => row.user_id))];
  const created = [];
  for (const parentId of parents) {
    created.push(await createAlert(parentId, type, message));
  }
  return created;
}

function cairoDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

function tomorrowDate(today) {
  const [year, month, day] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function userAlerts(userId, extra = {}) {
  return queryAll({
    TableName: TABLES.alerts,
    IndexName: 'user-id-index',
    KeyConditionExpression: 'user_id = :user',
    ...extra,
    ExpressionAttributeValues: { ':user': userId, ...(extra.ExpressionAttributeValues || {}) }
  });
}

// Runs when the parent opens My stops or Alerts: if tomorrow is a public
// holiday, the parent gets one "no bus tomorrow" alert (never two).
async function ensureTomorrowHolidayAlert(userId) {
  const tomorrow = tomorrowDate(cairoDate());
  const year = Number(tomorrow.slice(0, 4));
  const yearHolidays = await holidays.getHolidays(year);
  const holiday = yearHolidays.find((item) => item.date === tomorrow);
  if (!holiday) return null;

  const existing = await userAlerts(userId, {
    FilterExpression: '#type = :holiday AND contains(message, :date)',
    ExpressionAttributeNames: { '#type': 'type' },
    ExpressionAttributeValues: { ':holiday': 'holiday', ':date': tomorrow }
  });
  if (existing.length > 0) return toAlert(existing[0]);

  return createAlert(userId, 'holiday', `Tomorrow, ${tomorrow}, is a public holiday: ${holiday.name}.`);
}

// Newest first. The user-id-index has no sort key, so the sort happens here.
async function listAlerts(userId, unread) {
  const items = unread === true
    ? await userAlerts(userId, {
      FilterExpression: 'is_read = :no',
      ExpressionAttributeValues: { ':no': false }
    })
    : await userAlerts(userId);
  return items
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(toAlert);
}

// The condition makes DynamoDB check the owner in the same request as the
// update: another parent's alert (or a missing id) fails, and the caller gets 404.
async function markAlertRead(userId, alertId) {
  try {
    const result = await db.send(new UpdateCommand({
      TableName: TABLES.alerts,
      Key: { id: alertId },
      UpdateExpression: 'SET is_read = :yes',
      ConditionExpression: 'user_id = :user',
      ExpressionAttributeValues: { ':yes': true, ':user': userId },
      ReturnValues: 'ALL_NEW'
    }));
    return toAlert(result.Attributes);
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return null;
    throw err;
  }
}

module.exports = {
  createAlert,
  createAlertsForRoute,
  ensureTomorrowHolidayAlert,
  listAlerts,
  markAlertRead
};
