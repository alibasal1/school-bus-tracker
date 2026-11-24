// Tests for middleware/rateLimit.js through the real app.
// No token is sent, so every request below the limit ends as a 401 in requireAuth
// without touching the database. Over the limit, the 429 comes before requireAuth.
jest.mock('../db', () => jest.fn());

const request = require('supertest');

// A fresh app (and a fresh, empty Map of hits) for every test.
let app;
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-24T10:00:00Z') });
  jest.resetModules();
  delete process.env.RATE_LIMIT_MAX;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  app = require('../app');
});

afterEach(() => {
  console.log.mockRestore();
  jest.useRealTimers();
});

async function send(count, headers = () => ({})) {
  const statuses = [];
  for (let i = 1; i <= count; i += 1) {
    const res = await request(app).get('/api/alerts').set(headers(i));
    statuses.push(res.status);
  }
  return statuses;
}

test('requests under the limit pass on to the routes', async () => {
  const statuses = await send(60);
  expect(statuses.every((status) => status === 401)).toBe(true);
});

test('request number 61 in a minute gets 429 with Retry-After and a SECURITY line', async () => {
  await send(60);
  const res = await request(app).get('/api/alerts');
  expect(res.status).toBe(429);
  expect(res.body).toEqual({
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in 60 seconds.' }
  });
  expect(res.headers['retry-after']).toBe('60');

  const lines = console.log.mock.calls.map((call) => call[0]);
  expect(lines).toContain('SECURITY denied GET /api/alerts status=429 reason=RATE_LIMITED user=anonymous');
});

test('a new fake X-Forwarded-For on every request does not reset the count', async () => {
  const statuses = await send(61, (i) => ({ 'X-Forwarded-For': `10.0.0.${i}` }));
  expect(statuses.slice(0, 60).every((status) => status === 401)).toBe(true);
  expect(statuses[60]).toBe(429);
});

test('/api/health is never limited', async () => {
  await send(60);
  for (let i = 0; i < 20; i += 1) {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  }
});

test('the window resets after 60 seconds', async () => {
  await send(60);
  expect((await request(app).get('/api/alerts')).status).toBe(429);

  jest.advanceTimersByTime(30 * 1000);
  const half = await request(app).get('/api/alerts');
  expect(half.status).toBe(429);
  expect(half.headers['retry-after']).toBe('30');

  jest.advanceTimersByTime(30 * 1000);
  expect((await request(app).get('/api/alerts')).status).toBe(401);
});

test('RATE_LIMIT_MAX from the secret changes the limit', async () => {
  process.env.RATE_LIMIT_MAX = '5';
  const statuses = await send(6);
  expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
});

test('on Lambda the key is the API Gateway source IP, not the socket', () => {
  const { clientKey } = require('../middleware/rateLimit');
  const req = {
    apiGateway: { event: { requestContext: { http: { sourceIp: '203.0.113.7' } } } },
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': '1.2.3.4' }
  };
  expect(clientKey(req)).toBe('203.0.113.7');
  expect(clientKey({ socket: { remoteAddress: '127.0.0.1' }, headers: {} })).toBe('127.0.0.1');
});
