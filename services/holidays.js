// Calendarific data is cached in the Holidays table, one year at a time.
// Item shape (Ahmed's design): { id: "holiday-eg-2026-01-07", date, name, year: "2026" }.
const { BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../db/dynamo');
const { queryAll } = require('../db/pages');
const { TABLES } = require('../db/tables');

// BatchWriteItem takes at most 25 items per call.
const BATCH_SIZE = 25;

// Two kinds of item share the Holidays table:
//   - the Calendarific cache written here, id "holiday-eg-<date>",
//   - holidays an admin adds in Ahmed's service, id is a random UUID.
const CALENDARIFIC_PREFIX = 'holiday-eg-';

function savedItems(year) {
  return queryAll({
    TableName: TABLES.holidays,
    IndexName: 'year-index',
    KeyConditionExpression: '#year = :year',
    ExpressionAttributeNames: { '#year': 'year' },
    ExpressionAttributeValues: { ':year': String(year) }
  });
}

// One line per date. When an admin holiday and a Calendarific holiday fall on
// the same date, the admin's wins: the school decided it on purpose.
function mergeByDate(items) {
  const byDate = new Map();
  for (const item of items) {
    const fromAdmin = !String(item.id || '').startsWith(CALENDARIFIC_PREFIX);
    const current = byDate.get(item.date);
    if (!current || (fromAdmin && !current.fromAdmin)) {
      byDate.set(item.date, { date: item.date, name: item.name, fromAdmin });
    }
  }
  return [...byDate.values()]
    .map(({ date, name }) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchFromCalendarific(year, apiKey) {
  const url = new URL('https://calendarific.com/api/v2/holidays');
  url.search = new URLSearchParams({
    api_key: apiKey,
    country: 'EG',
    year: String(year),
    type: 'national'
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Calendarific returned an unsuccessful response.');
  const data = await response.json();
  const responseHolidays = data?.response?.holidays;
  if (!Array.isArray(responseHolidays)) throw new Error('Invalid Calendarific response.');

  // One item per date: Calendarific can list two names on the same day.
  const byDate = new Map();
  for (const holiday of responseHolidays) {
    const date = holiday?.date?.iso?.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || typeof holiday.name !== 'string') {
      throw new Error('Invalid Calendarific holiday.');
    }
    if (!byDate.has(date)) byDate.set(date, holiday.name);
  }
  return [...byDate].map(([date, name]) => ({ date, name }));
}

async function saveHolidays(year, list) {
  const items = list.map(({ date, name }) => ({
    id: `holiday-eg-${date}`,
    date,
    name,
    year: String(year)
  }));
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    let requests = items.slice(i, i + BATCH_SIZE).map((Item) => ({ PutRequest: { Item } }));
    // DynamoDB may hand back items it could not write yet; send those again.
    for (let attempt = 0; requests.length > 0 && attempt < 3; attempt += 1) {
      const result = await db.send(new BatchWriteCommand({
        RequestItems: { [TABLES.holidays]: requests }
      }));
      requests = result.UnprocessedItems?.[TABLES.holidays] || [];
    }
  }
}

async function getHolidays(year) {
  const items = await savedItems(year);
  const saved = mergeByDate(items);
  // Only a year that already has Calendarific items is cached. Admin holidays
  // alone do not count, or one admin entry would hide the whole national list.
  if (items.some((item) => String(item.id || '').startsWith(CALENDARIFIC_PREFIX))) return saved;

  const apiKey = process.env.CALENDARIFIC_API_KEY;
  if (!apiKey) {
    console.error('Calendarific API key is missing; using saved holidays.');
    return saved;
  }

  let holidayList;
  try {
    holidayList = await fetchFromCalendarific(year, apiKey);
  } catch {
    console.error('Calendarific request failed; using saved holidays.');
    return saved;
  }

  await saveHolidays(year, holidayList);
  const cached = holidayList.map(({ date, name }) => ({ id: `${CALENDARIFIC_PREFIX}${date}`, date, name }));
  return mergeByDate([...items, ...cached]);
}

module.exports = { getHolidays };
