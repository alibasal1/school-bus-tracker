const express = require('express');

jest.mock('../middleware/auth', () => ({
  sendError(res, status, code, message) {
    return res.status(status).json({ error: { code, message } });
  },
  requireAuth(req, res, next) {
    const token = (req.get('Authorization') || '').replace(/^Bearer /, '');
    if (!token) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Please log in.' }
      });
    }
    req.user = { id: '11111111-1111-4111-8111-111111111111', role: token };
    return next();
  },
  requireRole(...roles) {
    return (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You do not have permission.' }
        });
      }
      return next();
    };
  }
}));

jest.mock('../services/favorites', () => ({
  listFavorites: jest.fn(),
  addFavorite: jest.fn(),
  removeFavorite: jest.fn()
}));

jest.mock('../services/alerts', () => ({
  ensureTomorrowHolidayAlert: jest.fn(),
  listAlerts: jest.fn(),
  markAlertRead: jest.fn()
}));

jest.mock('../services/holidays', () => ({
  getHolidays: jest.fn()
}));

const favoritesService = require('../services/favorites');
const alertsService = require('../services/alerts');
const holidaysService = require('../services/holidays');
const app = express();
app.use(express.json());
app.use('/api', require('../routes/favorites'));

const parent = { Authorization: 'Bearer parent' };
const favoriteId = '22222222-2222-4222-8222-222222222222';
const routeId = '33333333-3333-4333-8333-333333333333';
const alertId = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  jest.clearAllMocks();
  favoritesService.listFavorites.mockResolvedValue([]);
  favoritesService.addFavorite.mockResolvedValue({ id: favoriteId, routeId, stopId: null });
  favoritesService.removeFavorite.mockResolvedValue(true);
  alertsService.ensureTomorrowHolidayAlert.mockResolvedValue(null);
  alertsService.listAlerts.mockResolvedValue([]);
  alertsService.markAlertRead.mockResolvedValue({
    id: alertId,
    type: 'boarding',
    message: 'Your child boarded.',
    isRead: true
  });
  holidaysService.getHolidays.mockResolvedValue([]);
});

describe('favorites, alerts, and holidays endpoints', () => {
  test('returns 401 when there is no token', async () => {
    const response = await require('supertest')(app).get('/api/favorites');
    expect(response.status).toBe(401);
  });

  test.each(['admin', 'supervisor'])('returns 403 for a %s on parent endpoints', async (role) => {
    const response = await require('supertest')(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${role}`);
    expect(response.status).toBe(403);
  });

  test('returns 404 when a favorite belongs to another user', async () => {
    favoritesService.removeFavorite.mockResolvedValue(false);
    const response = await require('supertest')(app)
      .delete(`/api/favorites/${favoriteId}`)
      .set(parent);
    expect(response.status).toBe(404);
  });

  test('returns 404 when an alert belongs to another user', async () => {
    alertsService.markAlertRead.mockResolvedValue(null);
    const response = await require('supertest')(app)
      .patch(`/api/alerts/${alertId}`)
      .set(parent)
      .send({ isRead: true });
    expect(response.status).toBe(404);
  });

  test('rejects invalid UUIDs', async () => {
    const response = await require('supertest')(app)
      .post('/api/favorites')
      .set(parent)
      .send({ routeId: 'not-a-uuid' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects a non-JSON request body', async () => {
    const response = await require('supertest')(app)
      .post('/api/favorites')
      .set(parent)
      .set('Content-Type', 'text/plain')
      .send('routeId');
    expect(response.status).toBe(415);
  });

  test('rejects a non-JSON alert update body', async () => {
    const response = await require('supertest')(app)
      .patch(`/api/alerts/${alertId}`)
      .set(parent)
      .set('Content-Type', 'text/plain')
      .send('isRead');
    expect(response.status).toBe(415);
  });

  test('returns 409 for a duplicate favorite', async () => {
    favoritesService.addFavorite.mockResolvedValue({ error: 'DUPLICATE' });
    const response = await require('supertest')(app)
      .post('/api/favorites')
      .set(parent)
      .send({ routeId });
    expect(response.status).toBe(409);
  });

  test('rejects an invalid holidays year', async () => {
    const response = await require('supertest')(app)
      .get('/api/holidays?year=abc')
      .set(parent);
    expect(response.status).toBe(400);
  });

  test('returns saved holidays when the holiday service has no new API data', async () => {
    holidaysService.getHolidays.mockResolvedValue([{ date: '2026-01-01', name: 'New Year' }]);
    const response = await require('supertest')(app)
      .get('/api/holidays?year=2026')
      .set(parent);
    expect(response.status).toBe(200);
    expect(response.body.holidays).toEqual([{ date: '2026-01-01', name: 'New Year' }]);
  });

  test('supports successful favorites, alerts, and holiday requests', async () => {
    const api = require('supertest')(app);
    const added = await api.post('/api/favorites').set(parent).send({ routeId });
    const listedFavorites = await api.get('/api/favorites').set(parent);
    const removed = await api.delete(`/api/favorites/${favoriteId}`).set(parent);
    const listedAlerts = await api.get('/api/alerts?unread=true').set(parent);
    const marked = await api.patch(`/api/alerts/${alertId}`).set(parent).send({ isRead: true });
    const listedHolidays = await api.get('/api/holidays?year=2026').set(parent);

    expect(added.status).toBe(201);
    expect(listedFavorites.status).toBe(200);
    expect(removed.status).toBe(204);
    expect(listedAlerts.status).toBe(200);
    expect(marked.status).toBe(200);
    expect(listedHolidays.status).toBe(200);
    expect(alertsService.listAlerts).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      true
    );
  });
});
