// Tests for the route events coming from Yehia's SNS topic.
jest.mock('../services/alerts', () => ({
  createAlert: jest.fn().mockResolvedValue({ id: 'a1' }),
  createAlertsForRoute: jest.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }])
}));
jest.mock('../services/processedEvents', () => ({ claimEvent: jest.fn() }));
jest.mock('../db', () => jest.fn());

const alerts = require('../services/alerts');
const processedEvents = require('../services/processedEvents');
const { isRouteEvent, translate } = require('../services/routeEvents');
const { handleQueueMessage } = require('../services/alertsQueue');

const ROUTE = '33333333-3333-4333-8333-333333333333';
const EVENT = '44444444-4444-4444-8444-444444444444';

function cancelled(extra = {}) {
  return {
    event_id: EVENT,
    event_type: 'trip.cancelled',
    route_id: ROUTE,
    trip_id: '55555555-5555-4555-8555-555555555555',
    occurred_at: '2026-11-24T05:00:00.000Z',
    payload: { service_date: '2026-11-24', run_type: 'morning', route_code: 'R1', reason: 'Bus in the garage', ...extra }
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  processedEvents.claimEvent.mockResolvedValue(true);
});
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('recognising and translating route events', () => {
  test('an event is recognised by event_type, this service own messages are not', () => {
    expect(isRouteEvent(cancelled())).toBe(true);
    expect(isRouteEvent({ type: 'cancel', routeId: ROUTE, message: 'x' })).toBe(false);
  });

  test('a cancellation becomes a cancel alert with a readable message', () => {
    const { message } = translate(cancelled());
    expect(message.type).toBe('cancel');
    expect(message.routeId).toBe(ROUTE);
    expect(message.message).toContain('Route R1');
    expect(message.message).toContain('morning');
    expect(message.message).toContain('2026-11-24');
    expect(message.message).toContain('Bus in the garage');
  });

  test('a new trip becomes a trip_change alert', () => {
    const { message } = translate({ ...cancelled(), event_type: 'trip.created' });
    expect(message.type).toBe('trip_change');
  });

  test('the message never exceeds the 300 characters the alerts table allows', () => {
    const { message } = translate(cancelled({ reason: 'x'.repeat(500) }));
    expect(message.message.length).toBeLessThanOrEqual(300);
  });

  test('an unknown event type, or a missing id, is reported not translated', () => {
    expect(translate({ ...cancelled(), event_type: 'route.deleted' }).error).toMatch(/unknown event_type/);
    expect(translate({ ...cancelled(), event_id: 'nope' }).error).toMatch(/event_id/);
    expect(translate({ ...cancelled(), route_id: 'nope' }).error).toMatch(/route_id/);
  });
});

describe('handling a route event from the queue', () => {
  test('the first delivery creates alerts for every parent of the route', async () => {
    const n = await handleQueueMessage(JSON.stringify(cancelled()));
    expect(n).toBe(2);
    expect(processedEvents.claimEvent).toHaveBeenCalledWith(EVENT, 'trip.cancelled');
    expect(alerts.createAlertsForRoute).toHaveBeenCalledWith(ROUTE, 'cancel', expect.stringContaining('Route R1'));
  });

  test('a repeated delivery of the same event creates nothing', async () => {
    processedEvents.claimEvent.mockResolvedValue(false);
    const n = await handleQueueMessage(JSON.stringify(cancelled()));
    expect(n).toBe(0);
    expect(alerts.createAlertsForRoute).not.toHaveBeenCalled();
  });

  test('a bad route event is dropped without claiming it', async () => {
    const n = await handleQueueMessage(JSON.stringify({ ...cancelled(), event_type: 'route.deleted' }));
    expect(n).toBe(0);
    expect(processedEvents.claimEvent).not.toHaveBeenCalled();
  });
});
