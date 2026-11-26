// Tests for middleware/auth.js against a fake DynamoDB, so no real data is used.
jest.mock('../db/dynamo', () => require('./helpers/fakeDynamo').createFake());
const db = require('../db/dynamo');
const express = require('express');
const request = require('supertest');
const { requireAuth, requireRole, hashToken } = require('../middleware/auth');

const TOKEN = 'a'.repeat(64);
const nowSeconds = () => Math.floor(Date.now() / 1000);

const app = express();
app.get('/parent-only', requireAuth, requireRole('parent'), (req, res) => res.json(req.user));

function addUser(id, role) {
  db.put('Users', { id, name: `Test ${role}`, email: `${id}@test.local`, role });
}

function addSession(userId, expiresAt) {
  const hash = hashToken(TOKEN);
  db.put('Sessions', { id: hash, token_hash: hash, user_id: userId, expires_at: expiresAt });
}

const call = () => request(app).get('/parent-only').set('Authorization', `Bearer ${TOKEN}`);

beforeEach(() => db.reset());

describe('requireAuth and requireRole', () => {
  test('no token -> 401', async () => {
    const res = await request(app).get('/parent-only');
    expect(res.status).toBe(401);
    expect(db.calls).toHaveLength(0);
  });

  test('token that is too short -> 401 without asking the database', async () => {
    const res = await request(app).get('/parent-only').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(401);
    expect(db.calls).toHaveLength(0);
  });

  test('unknown token -> 401', async () => {
    const res = await call();
    expect(res.status).toBe(401);
  });

  test('expired session -> 401', async () => {
    addUser('u1', 'parent');
    addSession('u1', nowSeconds() - 60);
    const res = await call();
    expect(res.status).toBe(401);
  });

  test('an expired session and an unknown token get exactly the same answer', async () => {
    const unknown = await call();
    addUser('u1', 'parent');
    addSession('u1', nowSeconds() - 60);
    const expired = await call();
    expect(expired.status).toBe(unknown.status);
    expect(expired.body).toEqual(unknown.body);
  });

  test('a session whose user no longer exists -> 401', async () => {
    addSession('ghost', nowSeconds() + 3600);
    const res = await call();
    expect(res.status).toBe(401);
  });

  test('valid parent session -> 200 and req.user is set from the Users table', async () => {
    addUser('u1', 'parent');
    addSession('u1', nowSeconds() + 3600);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'u1', role: 'parent', name: 'Test parent' });
  });

  test('valid admin session on a parent route -> 403', async () => {
    addUser('u2', 'admin');
    addSession('u2', nowSeconds() + 3600);
    const res = await call();
    expect(res.status).toBe(403);
  });

  test('the Sessions table is searched by the hash, never the raw token', async () => {
    await call();
    const get = db.calls.find((c) => c.input.TableName === 'Sessions');
    expect(get.name).toBe('GetCommand');
    expect(get.input.Key).toEqual({ id: hashToken(TOKEN) });
    expect(JSON.stringify(db.calls)).not.toContain(TOKEN);
  });
});
