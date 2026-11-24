jest.mock('../services/alerts', () => ({
  createAlert: jest.fn().mockResolvedValue({ id: 'a1' }),
  createAlertsForRoute: jest.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }])
}));
jest.mock('../db', () => jest.fn());

const alerts = require('../services/alerts');
const { handleQueueMessage, checkMessage } = require('../services/alertsQueue');

const PARENT = '11111111-1111-4111-8111-111111111111';
const ROUTE = '33333333-3333-4333-8333-333333333333';

beforeEach(() => jest.clearAllMocks());
beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));

describe('alerts queue', () => {
  test('boarding message creates one alert for the parent', async () => {
    const n = await handleQueueMessage(JSON.stringify({ type: 'boarding', parentId: PARENT, message: ' Omar boarded. ' }));
    expect(n).toBe(1);
    expect(alerts.createAlert).toHaveBeenCalledWith(PARENT, 'boarding', 'Omar boarded.');
  });

  test('cancel message creates alerts for every parent of the route', async () => {
    const n = await handleQueueMessage(JSON.stringify({ type: 'cancel', routeId: ROUTE, message: 'Trip cancelled.' }));
    expect(n).toBe(2);
    expect(alerts.createAlertsForRoute).toHaveBeenCalledWith(ROUTE, 'cancel', 'Trip cancelled.');
  });

  test('not JSON is dropped', async () => {
    expect(await handleQueueMessage('hello')).toBe(0);
    expect(alerts.createAlert).not.toHaveBeenCalled();
  });

  test('unknown type is dropped', async () => {
    expect(await handleQueueMessage(JSON.stringify({ type: 'holiday', parentId: PARENT, message: 'x' }))).toBe(0);
  });

  test('bad ids and long messages are rejected', () => {
    expect(checkMessage({ type: 'boarding', parentId: 'abc', message: 'x' })).toMatch(/parentId/);
    expect(checkMessage({ type: 'cancel', parentId: PARENT, message: 'x' })).toMatch(/routeId/);
    expect(checkMessage({ type: 'boarding', parentId: PARENT, message: 'x'.repeat(301) })).toMatch(/300/);
    expect(checkMessage({ type: 'boarding', parentId: PARENT, message: 'ok' })).toBeNull();
  });

  test('database error is thrown so SQS tries again', async () => {
    alerts.createAlert.mockRejectedValueOnce(new Error('db down'));
    await expect(handleQueueMessage(JSON.stringify({ type: 'dropped', parentId: PARENT, message: 'x' }))).rejects.toThrow('db down');
  });
});
