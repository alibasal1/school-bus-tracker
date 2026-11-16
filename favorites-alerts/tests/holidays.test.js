const mockSql = jest.fn();
jest.mock('../db', () => mockSql);

const holidays = require('../services/holidays');

describe('Calendarific holiday cache', () => {
  const originalKey = process.env.CALENDARIFIC_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockSql.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.CALENDARIFIC_API_KEY;
    else process.env.CALENDARIFIC_API_KEY = originalKey;
  });

  test('does not call Calendarific when the year is already saved', async () => {
    const saved = [{ date: '2026-01-01', name: 'New Year' }];
    mockSql.mockResolvedValueOnce(saved);
    global.fetch = jest.fn();

    await expect(holidays.getHolidays(2026)).resolves.toEqual(saved);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('fetches, saves, and returns holidays when the year is not cached', async () => {
    const saved = [{ date: '2026-01-01', name: 'New Year' }];
    process.env.CALENDARIFIC_API_KEY = 'test-key';
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(saved);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          holidays: [{ name: 'New Year', date: { iso: '2026-01-01T00:00:00+00:00' } }]
        }
      })
    });

    await expect(holidays.getHolidays(2026)).resolves.toEqual(saved);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockSql).toHaveBeenCalledTimes(3);
  });

  test('returns saved holidays when the API key is missing', async () => {
    delete process.env.CALENDARIFIC_API_KEY;
    mockSql.mockResolvedValueOnce([]);
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(holidays.getHolidays(2026)).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Calendarific API key is missing; using saved holidays.'
    );
  });

  test('returns saved holidays when Calendarific is unavailable', async () => {
    process.env.CALENDARIFIC_API_KEY = 'test-key';
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);
    global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(holidays.getHolidays(2026)).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      'Calendarific request failed; using saved holidays.'
    );
  });
});
