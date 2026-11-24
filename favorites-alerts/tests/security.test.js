// Tests for the two security middlewares: the response headers and the SECURITY log line.
const express = require('express');
const request = require('supertest');
const securityHeaders = require('../middleware/securityHeaders');
const logger = require('../middleware/logger');

function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(logger);
  app.get('/ok', (req, res) => res.json({ ok: true }));
  app.get('/denied', (req, res) => {
    res.locals.denyCode = 'FORBIDDEN';
    res.status(403).json({ error: { code: 'FORBIDDEN' } });
  });
  app.get('/denied-known-user', (req, res) => {
    req.user = { id: 'u1', role: 'parent' };
    res.locals.denyCode = 'NOT_FOUND';
    res.status(404).json({ error: { code: 'NOT_FOUND' } });
  });
  return app;
}

describe('securityHeaders', () => {
  test('every response carries the blocking headers and no Express banner', async () => {
    const res = await request(buildApp()).get('/ok');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('HSTS is only sent when the request arrived over HTTPS', async () => {
    const plain = await request(buildApp()).get('/ok');
    expect(plain.headers['strict-transport-security']).toBeUndefined();
    const secure = await request(buildApp()).get('/ok').set('X-Forwarded-Proto', 'https');
    expect(secure.headers['strict-transport-security']).toContain('max-age=31536000');
  });
});

describe('security logging', () => {
  let lines;
  beforeEach(() => {
    lines = [];
    jest.spyOn(console, 'log').mockImplementation((line) => lines.push(String(line)));
  });
  afterEach(() => console.log.mockRestore());

  test('a refused request is logged with the reason', async () => {
    await request(buildApp()).get('/denied');
    const security = lines.find((l) => l.startsWith('SECURITY'));
    expect(security).toContain('status=403');
    expect(security).toContain('reason=FORBIDDEN');
    expect(security).toContain('user=anonymous');
  });

  test('a refused logged-in user is named, with their role', async () => {
    await request(buildApp()).get('/denied-known-user');
    const security = lines.find((l) => l.startsWith('SECURITY'));
    expect(security).toContain('user=u1');
    expect(security).toContain('role=parent');
    expect(security).toContain('reason=NOT_FOUND');
  });

  test('a normal request writes no SECURITY line', async () => {
    await request(buildApp()).get('/ok');
    expect(lines.some((l) => l.startsWith('SECURITY'))).toBe(false);
  });

  test('the log line never contains the token', async () => {
    const token = 'b'.repeat(64);
    await request(buildApp()).get('/denied').set('Authorization', `Bearer ${token}`);
    expect(lines.join('\n')).not.toContain(token);
  });
});
