// Calendarific data is cached in the Holidays table, one year at a time.
// Item shape (Ahmed's design): { id: "holiday-eg-2026-01-07", date, name, year: "2026" }.
const { BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../db/dynamo');
const { queryAll } = require('../db/pages');
const { TABLES } = require('../db/tables');

// BatchWriteItem takes at most 25 items per call.
const BATCH_SIZE = 25;

async function savedHolidays(year) {
  const items = await queryAll({
    TableName: TABLES.holidays,
    IndexName: 'year-index',
    KeyConditionExpression: '#year = :year',
    ExpressionAttributeNames: { '#year': 'year' },
    ExpressionAttributeValues: { ':year': String(year) }
  });
  return items
    .map((item) => ({ date: item.date, name: item.name }))
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
  const saved = await savedHolidays(year);
  if (saved.length > 0) return saved;

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
  return holidayList.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { getHolidays };
