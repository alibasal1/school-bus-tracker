// Tests for the Calendarific cache in the Holidays table, against a fake DynamoDB.
jest.mock('../db/dynamo', () => require('./helpers/fakeDynamo').createFake());

const db = require('../db/dynamo');
const holidays = require('../services/holidays');

function calendarific(list) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { holidays: list } })
  });
}

describe('Calendarific holiday cache', () => {
  const originalKey = process.env.CALENDARIFIC_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => db.reset());

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.CALENDARIFIC_API_KEY;
    else process.env.CALENDARIFIC_API_KEY = originalKey;
  });

  test('does not call Calendarific when the year is already saved', async () => {
    db.put('Holidays', { id: 'holiday-eg-2026-01-07', date: '2026-01-07', name: 'Coptic Christmas', year: '2026' });
    global.fetch = jest.fn();

    await expect(holidays.getHolidays(2026)).resolves.toEqual([{ date: '2026-01-07', name: 'Coptic Christmas' }]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('reads the year through year-index, with the year as a string', async () => {
    global.fetch = jest.fn();
    delete process.env.CALENDARIFIC_API_KEY;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await holidays.getHolidays(2026);
    const query = db.calls.find((c) => c.name === 'QueryCommand');
    expect(query.input.IndexName).toBe('year-index');
    expect(query.input.ExpressionAttributeValues[':year']).toBe('2026');
  });

  test('fetches, saves, and returns holidays when the year is not cached', async () => {
    process.env.CALENDARIFIC_API_KEY = 'test-key';
    global.fetch = calendarific([{ name: 'New Year', date: { iso: '2026-01-01T00:00:00+00:00' } }]);

    await expect(holidays.getHolidays(2026)).resolves.toEqual([{ date: '2026-01-01', name: 'New Year' }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(db.all('Holidays')).toEqual([{ id: 'holiday-eg-2026-01-01', date: '2026-01-01', name: 'New Year', year: '2026' }]);
  });

  test('an admin holiday from Ahmed does not block Calendarific, and both kinds show once per date', async () => {
    process.env.CALENDARIFIC_API_KEY = 'test-key';
    // Two admin holidays (random UUID ids): one on its own date, one on a Calendarific date.
    db.put('Holidays', { id: '0b7e1c2a-1111-4111-8111-111111111111', date: '2026-09-01', name: 'School founding day', year: '2026' });
    db.put('Holidays', { id: '0b7e1c2a-2222-4222-8222-222222222222', date: '2026-01-07', name: 'Coptic Christmas (school)', year: '2026' });
    global.fetch = calendarific([
      { name: 'Coptic Christmas Day', date: { iso: '2026-01-07' } },
      { name: 'Revolution Day', date: { iso: '2026-01-25' } }
    ]);

    const list = await holidays.getHolidays(2026);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(list).toEqual([
      { date: '2026-01-07', name: 'Coptic Christmas (school)' },
      { date: '2026-01-25', name: 'Revolution Day' },
      { date: '2026-09-01', name: 'School founding day' }
    ]);
  });

  test('a year with Calendarific items is not fetched again, and admin holidays are merged in', async () => {
    db.put('Holidays', { id: 'holiday-eg-2026-01-25', date: '2026-01-25', name: 'Revolution Day', year: '2026' });
    db.put('Holidays', { id: '0b7e1c2a-1111-4111-8111-111111111111', date: '2026-09-01', name: 'School founding day', year: '2026' });
    global.fetch = jest.fn();

    const list = await holidays.getHolidays(2026);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(list.map((h) => h.date)).toEqual(['2026-01-25', '2026-09-01']);
  });

  test('more than 25 holidays are saved in batches of 25', async () => {
    process.env.CALENDARIFIC_API_KEY = 'test-key';
    const list = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
      return { name: `Day ${i + 1}`, date: { iso: date } };
    });
    global.fetch = calendarific(list);

    await holidays.getHolidays(2026);
    const batches = db.calls.filter((c) => c.name === 'BatchWriteCommand');
    expect(batches.map((b) => b.input.RequestItems.Holidays.length)).toEqual([25, 5]);
    expect(db.all('Holidays')).toHaveLength(30);
  });

  test('returns saved holidays when the API key is missing', async () => {
    delete process.env.CALENDARIFIC_API_KEY;
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(holidays.getHolidays(2026)).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Calendarific API key is missing; using saved holidays.');
  });

  test('returns saved holidays when Calendarific is unavailable', async () => {
    process.env.CALENDARIFIC_API_KEY = 'test-key';
    global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(holidays.getHolidays(2026)).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Calendarific request failed; using saved holidays.');
  });
});
