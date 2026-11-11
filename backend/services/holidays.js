// Calendarific data is cached in the holidays table by year.
const sql = require('../db');

async function savedHolidays(year) {
  return sql`
    SELECT date::text AS date, name
    FROM holidays
    WHERE year = ${year}
    ORDER BY date
  `;
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
    holidayList = responseHolidays.map((holiday) => {
      const date = holiday?.date?.iso?.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || typeof holiday.name !== 'string') {
        throw new Error('Invalid Calendarific holiday.');
      }
      return { date, name: holiday.name };
    });
  } catch {
    console.error('Calendarific request failed; using saved holidays.');
    return saved;
  }

  for (const holiday of holidayList) {
    await sql`
      INSERT INTO holidays (date, name, year)
      VALUES (${holiday.date}::date, ${holiday.name}, ${year})
      ON CONFLICT (date) DO UPDATE
      SET name = EXCLUDED.name, year = EXCLUDED.year
    `;
  }

  return savedHolidays(year);
}

module.exports = { getHolidays };
