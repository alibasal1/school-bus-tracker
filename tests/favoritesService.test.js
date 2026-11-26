// Tests for services/favorites.js itself, against a fake DynamoDB.
jest.mock('../db/dynamo', () => require('./helpers/fakeDynamo').createFake());
jest.mock('../services/alerts', () => ({ ensureTomorrowHolidayAlert: jest.fn().mockResolvedValue(null) }));
jest.mock('../services/holidays', () => ({ getHolidays: jest.fn().mockResolvedValue([]) }));

const db = require('../db/dynamo');
const holidays = require('../services/holidays');
const favorites = require('../services/favorites');

const PARENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
// 05:00 UTC is 07:00 in Cairo on 26 November.
const TODAY = '2026-11-26';

function seedRoutes() {
  db.put('Routes', { id: 'route-b', code: 'R2', name: 'Nasr City', area: 'Nasr City' });
  db.put('Routes', { id: 'route-a', code: 'R1', name: 'Maadi', area: 'Maadi' });
  db.put('Stops', { id: 'stop-a2', route_id: 'route-a', name: 'Club', stop_order: 2 });
  db.put('Stops', { id: 'stop-a1', route_id: 'route-a', name: 'Gate 2', stop_order: 1 });
  db.put('Trips', { id: 'trip-a-am', route_id: 'route-a', run_type: 'morning', status: 'scheduled', cancelled_date: null });
  db.put('TripStops', { trip_id: 'trip-a-am', stop_id: 'stop-a1', arrive_from: '07:10', arrive_to: '07:20' });
}

beforeEach(() => {
  db.reset();
  holidays.getHolidays.mockResolvedValue([]);
  jest.useFakeTimers({ now: new Date(`${TODAY}T05:00:00Z`) });
  seedRoutes();
});
afterEach(() => jest.useRealTimers());

describe('listOptions', () => {
  test('groups the stops under each route, sorted by code and stop_order', async () => {
    const routes = await favorites.listOptions();
    expect(routes.map((route) => route.code)).toEqual(['R1', 'R2']);
    expect(routes[0].stops.map((stop) => stop.name)).toEqual(['Gate 2', 'Club']);
    expect(routes[1].stops).toEqual([]);
  });
});

describe('addFavorite', () => {
  test('saves a stop with a new UUID and the parent as owner', async () => {
    const saved = await favorites.addFavorite(PARENT, 'route-a', 'stop-a1');
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    const [item] = db.all('Favorites');
    expect(item).toMatchObject({ user_id: PARENT, route_id: 'route-a', stop_id: 'stop-a1' });
  });

  test('a whole-route favorite is saved without a stop_id field', async () => {
    await favorites.addFavorite(PARENT, 'route-a', null);
    const [item] = db.all('Favorites');
    expect(item).not.toHaveProperty('stop_id');
  });

  test('an unknown route is NOT_FOUND', async () => {
    expect(await favorites.addFavorite(PARENT, 'route-x', null)).toEqual({ error: 'NOT_FOUND' });
  });

  test('a stop of another route is NOT_FOUND', async () => {
    db.put('Stops', { id: 'stop-b1', route_id: 'route-b', name: 'Mall', stop_order: 1 });
    expect(await favorites.addFavorite(PARENT, 'route-a', 'stop-b1')).toEqual({ error: 'NOT_FOUND' });
  });

  test('the same route and stop twice is DUPLICATE and saves nothing new', async () => {
    await favorites.addFavorite(PARENT, 'route-a', 'stop-a1');
    expect(await favorites.addFavorite(PARENT, 'route-a', 'stop-a1')).toEqual({ error: 'DUPLICATE' });
    expect(db.all('Favorites')).toHaveLength(1);
  });

  test('another parent may save the same stop', async () => {
    await favorites.addFavorite(PARENT, 'route-a', 'stop-a1');
    const saved = await favorites.addFavorite(OTHER, 'route-a', 'stop-a1');
    expect(saved.error).toBeUndefined();
  });
});

describe('removeFavorite', () => {
  test('the owner can delete it', async () => {
    const { id } = await favorites.addFavorite(PARENT, 'route-a', 'stop-a1');
    expect(await favorites.removeFavorite(PARENT, id)).toBe(true);
    expect(db.all('Favorites')).toHaveLength(0);
  });

  test("another parent's favorite is not deleted (the caller answers 404)", async () => {
    const { id } = await favorites.addFavorite(PARENT, 'route-a', 'stop-a1');
    expect(await favorites.removeFavorite(OTHER, id)).toBe(false);
    expect(db.all('Favorites')).toHaveLength(1);
  });

  test('a favorite that does not exist gives false', async () => {
    expect(await favorites.removeFavorite(PARENT, 'nope')).toBe(false);
  });
});

describe('listFavorites', () => {
  test("shows today's next bus window and the trip status for a saved stop", async () => {
    await favorites.addFavorite(PARENT, 'route-a', 'stop-a1');
    const [row] = await favorites.listFavorites(PARENT);
    expect(row).toMatchObject({
      routeName: 'Maadi',
      stopName: 'Gate 2',
      arrivalFrom: '07:10',
      arrivalTo: '07:20',
      tripStatus: 'scheduled',
      noBusToday: false
    });
  });

  test('a trip with cancelled_date today gives no time and tripStatus cancelled', async () => {
    db.put('Trips', { id: 'trip-a-am', route_id: 'route-a', status: 'scheduled', cancelled_date: TODAY });
    await favorites.addFavorite(PARENT, 'route-a', 'stop-a1');
    const [row] = await favorites.listFavorites(PARENT);
    expect(row.arrivalFrom).toBeNull();
    expect(row.tripStatus).toBe('cancelled');
  });

  test('a trip dated another day is not today', async () => {
    db.put('Trips', { id: 'trip-a-am', route_id: 'route-a', status: 'scheduled', date: '2026-11-27' });
    await favorites.addFavorite(PARENT, 'route-a', 'stop-a1');
    const [row] = await favorites.listFavorites(PARENT);
    expect(row.arrivalFrom).toBeNull();
  });

  test('on a public holiday there is no bus time and noBusToday is true', async () => {
    holidays.getHolidays.mockResolvedValue([{ date: TODAY, name: 'Test Day' }]);
    await favorites.addFavorite(PARENT, 'route-a', 'stop-a1');
    const [row] = await favorites.listFavorites(PARENT);
    expect(row.noBusToday).toBe(true);
    expect(row.arrivalFrom).toBeNull();
  });

  test("only the parent's own favorites are listed", async () => {
    await favorites.addFavorite(PARENT, 'route-a', 'stop-a1');
    await favorites.addFavorite(OTHER, 'route-a', null);
    const rows = await favorites.listFavorites(PARENT);
    expect(rows).toHaveLength(1);
    expect(rows[0].stopName).toBe('Gate 2');
  });
});
