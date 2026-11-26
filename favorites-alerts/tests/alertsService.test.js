// Tests for services/alerts.js and services/processedEvents.js, against a fake DynamoDB.
jest.mock('../db/dynamo', () => require('./helpers/fakeDynamo').createFake());
jest.mock('../services/holidays', () => ({ getHolidays: jest.fn().mockResolvedValue([]) }));

const db = require('../db/dynamo');
const holidays = require('../services/holidays');
const alerts = require('../services/alerts');
const { claimEvent } = require('../services/processedEvents');

const PARENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  db.reset();
  holidays.getHolidays.mockResolvedValue([]);
});

describe('alerts', () => {
  test('listAlerts gives newest first, and unread=true leaves out the read ones', async () => {
    db.put('Alerts', { id: 'a1', user_id: PARENT, type: 'boarding', message: 'old', is_read: true, created_at: '2026-11-25T05:00:00.000Z' });
    db.put('Alerts', { id: 'a2', user_id: PARENT, type: 'boarding', message: 'new', is_read: false, created_at: '2026-11-26T05:00:00.000Z' });
    db.put('Alerts', { id: 'a3', user_id: OTHER, type: 'boarding', message: 'not mine', is_read: false, created_at: '2026-11-26T06:00:00.000Z' });

    const all = await alerts.listAlerts(PARENT);
    expect(all.map((a) => a.message)).toEqual(['new', 'old']);
    const unread = await alerts.listAlerts(PARENT, true);
    expect(unread.map((a) => a.id)).toEqual(['a2']);
  });

  test('markAlertRead works for the owner only', async () => {
    db.put('Alerts', { id: 'a1', user_id: PARENT, type: 'boarding', message: 'x', is_read: false, created_at: '2026-11-26T05:00:00.000Z' });
    expect(await alerts.markAlertRead(OTHER, 'a1')).toBeNull();
    expect(db.all('Alerts')[0].is_read).toBe(false);

    const marked = await alerts.markAlertRead(PARENT, 'a1');
    expect(marked.isRead).toBe(true);
  });

  test('createAlertsForRoute sends one alert to each parent who saved the route', async () => {
    db.put('Favorites', { id: 'f1', user_id: PARENT, route_id: 'route-a', stop_id: 'stop-1' });
    db.put('Favorites', { id: 'f2', user_id: PARENT, route_id: 'route-a' });
    db.put('Favorites', { id: 'f3', user_id: OTHER, route_id: 'route-a' });
    db.put('Favorites', { id: 'f4', user_id: OTHER, route_id: 'route-b' });

    const created = await alerts.createAlertsForRoute('route-a', 'cancel', 'Trip cancelled.');
    expect(created).toHaveLength(2);
    expect(db.all('Alerts').map((a) => a.user_id).sort()).toEqual([PARENT, OTHER].sort());
  });

  test('the holiday alert for tomorrow is created only once', async () => {
    const tomorrowCairo = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) + 'T00:00:00Z');
    tomorrowCairo.setUTCDate(tomorrowCairo.getUTCDate() + 1);
    const date = tomorrowCairo.toISOString().slice(0, 10);
    holidays.getHolidays.mockResolvedValue([{ date, name: 'Test Holiday' }]);

    await alerts.ensureTomorrowHolidayAlert(PARENT);
    await alerts.ensureTomorrowHolidayAlert(PARENT);
    const saved = db.all('Alerts');
    expect(saved).toHaveLength(1);
    expect(saved[0].message).toContain(date);
  });
});

describe('processed events', () => {
  test('the first event_id is claimed', async () => {
    expect(await claimEvent('evt-1', 'trip.cancelled')).toBe(true);
    expect(db.all('ProcessedEvents')[0]).toMatchObject({ event_id: 'evt-1', event_type: 'trip.cancelled' });
  });

  test('a duplicate event_id is refused, so the event is skipped', async () => {
    await claimEvent('evt-1', 'trip.cancelled');
    expect(await claimEvent('evt-1', 'trip.cancelled')).toBe(false);
    expect(db.all('ProcessedEvents')).toHaveLength(1);
  });

  test('any other database error is thrown, so SQS tries again', async () => {
    db.failNext(Object.assign(new Error('table missing'), { name: 'ResourceNotFoundException' }));
    await expect(claimEvent('evt-2', 'trip.cancelled')).rejects.toThrow('table missing');
  });
});
