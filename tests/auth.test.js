// Tests for middleware/auth.js. The database is replaced by a fake, so no real data is used.
jest.mock('../db', () => jest.fn());
const sql = require('../db');
const express = require('express');
const request = require('supertest');
const { requireAuth, requireRole, hashToken } = require('../middleware/auth');

const TOKEN = 'a'.repeat(64);
const later = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const earlier = new Date(Date.now() - 60 * 1000).toISOString();

const app = express();
app.get('/parent-only', requireAuth, requireRole('parent'), (req, res) => res.json(req.user));

beforeEach(() => sql.mockReset());

describe('requireAuth and requireRole', () => {
  test('no token -> 401', async () => {
    const res = await request(app).get('/parent-only');
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  test('token that is too short -> 401 without asking the database', async () => {
    const res = await request(app).get('/parent-only').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  test('unknown token -> 401', async () => {
    sql.mockResolvedValue([]);
    const res = await request(app).get('/parent-only').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(401);
  });

  test('expired session -> 401', async () => {
    sql.mockResolvedValue([{ user_id: 'u1', role: 'parent', expires_at: earlier }]);
    const res = await request(app).get('/parent-only').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(401);
  });

  test('valid parent session -> 200 and req.user is set', async () => {
    sql.mockResolvedValue([{ user_id: 'u1', role: 'parent', expires_at: later }]);
    const res = await request(app).get('/parent-only').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'u1', role: 'parent' });
  });

  test('valid admin session on a parent route -> 403', async () => {
    sql.mockResolvedValue([{ user_id: 'u2', role: 'admin', expires_at: later }]);
    const res = await request(app).get('/parent-only').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('the database is searched by the hash, never the raw token', async () => {
    sql.mockResolvedValue([]);
    await request(app).get('/parent-only').set('Authorization', `Bearer ${TOKEN}`);
    const values = sql.mock.calls[0].slice(1);
    expect(values).toContain(hashToken(TOKEN));
    expect(values).not.toContain(TOKEN);
  });
});
