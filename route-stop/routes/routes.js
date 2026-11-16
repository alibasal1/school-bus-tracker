// Route & Stop routes. Owner: Yehia (247330).
const express = require('express');
const controller = require('../controllers/routes');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/routes', requireAuth, controller.listRoutes);
router.post('/routes', requireAuth, requireRole('admin'), controller.createRoute);
router.put('/routes/:id', requireAuth, requireRole('admin'), controller.updateRoute);
router.delete('/routes/:id', requireAuth, requireRole('admin'), controller.deleteRoute);
router.post('/routes/:id/stops', requireAuth, requireRole('admin'), controller.addStop);
router.put('/stops/:id', requireAuth, requireRole('admin'), controller.updateStop);
router.delete('/stops/:id', requireAuth, requireRole('admin'), controller.deleteStop);
router.post('/buses', requireAuth, requireRole('admin'), controller.createBus);
router.get('/trips', requireAuth, controller.listTrips);
router.post('/trips', requireAuth, requireRole('admin'), controller.createTrip);
router.patch('/trips/:id/status', requireAuth, requireRole('admin'), controller.cancelTrip);

module.exports = router;
