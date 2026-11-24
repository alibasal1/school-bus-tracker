// Tests for services/favorites.js itself, with a fake database.
// The point of these two: the arrival time must be for today, and a database
// that has not run Yehia's service_date migration must not answer with a 500.
jest.mock('../db', () => jest.fn());
jest.mock('../services/alerts', () => ({ ensureTomorrowHolidayAlert: jest.fn().mockResolvedValue(null) }));
jest.mock('../services/holidays', () => ({ getHolidays: jest.fn().mockResolvedValue([]) }));

const PARENT = '11111111-1111-4111-8111-111111111111';

function undefinedColumn() {
  return Object.assign(new Error('column t.service_date does not exist'), { code: '42703' });
}

// The SQL text is the first argument of the tagged template call.
function queryText(call) {
  return call[0].join(' ? ');
}

// resetModules gives a fresh copy of the service, so the "column is missing"
// flag from one test does not leak into the next. The fake database has to be
// required from the same fresh registry, or the service would hold a different
// copy of it.
let sql;
let favorites;
beforeEach(() => {
  jest.resetModules();
  sql = require('../db');
  favorites = require('../services/favorites');
  sql.mockReset();
});

describe('listFavorites', () => {

  test('asks only for trips whose service_date is today', async () => {
    sql.mockResolvedValue([]);
    await favorites.listFavorites(PARENT);
    expect(queryText(sql.mock.calls[0])).toContain('t.service_date =');
  });

  test('falls back to a query without service_date when the column is missing', async () => {
    sql.mockRejectedValueOnce(undefinedColumn()).mockResolvedValue([]);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const rows = await favorites.listFavorites(PARENT);
    expect(rows).toEqual([]);
    expect(sql).toHaveBeenCalledTimes(2);
    expect(queryText(sql.mock.calls[1])).not.toContain('t.service_date');

    // The second request must not try the missing column again.
    await favorites.listFavorites(PARENT);
    expect(queryText(sql.mock.calls[2])).not.toContain('t.service_date');
    console.error.mockRestore();
  });

  test('any other database error is still thrown, not hidden', async () => {
    sql.mockRejectedValue(Object.assign(new Error('connection lost'), { code: '08006' }));
    await expect(favorites.listFavorites(PARENT)).rejects.toThrow('connection lost');
  });
});

describe('listOptions', () => {

  test('falls back to every route when routes.is_active is missing', async () => {
    const missing = Object.assign(new Error('column r.is_active does not exist'), { code: '42703' });
    sql.mockRejectedValueOnce(missing).mockResolvedValue([
      { routeId: 'r1', routeCode: 'R1', routeName: 'Maadi', stopId: 's1', stopName: 'Gate 2', stopOrder: 1 }
    ]);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const routes = await favorites.listOptions();
    expect(routes).toHaveLength(1);
    expect(queryText(sql.mock.calls[0])).toContain('r.is_active');
    expect(queryText(sql.mock.calls[1])).not.toContain('r.is_active');

    // The next request goes straight to the query without the column.
    await favorites.listOptions();
    expect(queryText(sql.mock.calls[2])).not.toContain('r.is_active');
    console.error.mockRestore();
  });

  test('groups the rows into one entry per route, and drops empty stops', async () => {
    sql.mockResolvedValue([
      { routeId: 'r1', routeCode: 'R1', routeName: 'Maadi', stopId: 's1', stopName: 'Gate 2', stopOrder: 1 },
      { routeId: 'r1', routeCode: 'R1', routeName: 'Maadi', stopId: 's2', stopName: 'Club', stopOrder: 2 },
      { routeId: 'r2', routeCode: 'R2', routeName: 'Nasr City', stopId: null, stopName: null, stopOrder: null }
    ]);
    const routes = await favorites.listOptions();
    expect(routes).toHaveLength(2);
    expect(routes[0].stops.map((stop) => stop.name)).toEqual(['Gate 2', 'Club']);
    expect(routes[1].stops).toEqual([]);
  });
});
