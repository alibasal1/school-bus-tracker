// Favorites & Alerts routes. Owner: Ali (246090).
const express = require('express');
const controller = require('../controllers/favorites');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/favorites', requireAuth, requireRole('parent'), controller.listFavorites);
router.post('/favorites', requireAuth, requireRole('parent'), controller.addFavorite);
router.delete('/favorites/:id', requireAuth, requireRole('parent'), controller.removeFavorite);
router.get('/alerts', requireAuth, requireRole('parent'), controller.listAlerts);
router.patch('/alerts/:id', requireAuth, requireRole('parent'), controller.markAlertRead);
router.get('/holidays', requireAuth, controller.listHolidays);

module.exports = router;
