// Alerts service. Callers provide IDs and messages, never request/response objects.
const sql = require('../db');
const holidays = require('./holidays');

async function createAlert(userId, type, message) {
  const rows = await sql`
    INSERT INTO alerts (user_id, type, message)
    VALUES (${userId}::uuid, ${type}, ${message})
    RETURNING id, type, message, is_read AS "isRead", created_at AS "createdAt"
  `;
  return rows[0];
}

async function createAlertsForRoute(routeId, type, message) {
  const parents = await sql`
    SELECT DISTINCT user_id
    FROM favorites
    WHERE route_id = ${routeId}::uuid
  `;
  const created = [];
  for (const parent of parents) {
    created.push(await createAlert(parent.user_id, type, message));
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

async function ensureTomorrowHolidayAlert(userId) {
  const tomorrow = tomorrowDate(cairoDate());
  const year = Number(tomorrow.slice(0, 4));
  const yearHolidays = await holidays.getHolidays(year);
  const holiday = yearHolidays.find((item) => item.date === tomorrow);
  if (!holiday) return null;

  const message = `Tomorrow, ${tomorrow}, is a public holiday: ${holiday.name}.`;
  const existing = await sql`
    SELECT id
    FROM alerts
    WHERE user_id = ${userId}::uuid
      AND type = 'holiday'
      AND message LIKE ${`%${tomorrow}%`}
    LIMIT 1
  `;
  if (existing.length > 0) return existing[0];

  return createAlert(userId, 'holiday', message);
}

async function listAlerts(userId, unread) {
  if (unread === true) {
    return sql`
      SELECT id, type, message, is_read AS "isRead", created_at AS "createdAt"
      FROM alerts
      WHERE user_id = ${userId}::uuid AND is_read = false
      ORDER BY created_at DESC
    `;
  }
  return sql`
    SELECT id, type, message, is_read AS "isRead", created_at AS "createdAt"
    FROM alerts
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC
  `;
}

async function markAlertRead(userId, alertId) {
  const rows = await sql`
    UPDATE alerts
    SET is_read = true
    WHERE id = ${alertId}::uuid AND user_id = ${userId}::uuid
    RETURNING id, type, message, is_read AS "isRead", created_at AS "createdAt"
  `;
  return rows[0] || null;
}

module.exports = {
  createAlert,
  createAlertsForRoute,
  ensureTomorrowHolidayAlert,
  listAlerts,
  markAlertRead
};
