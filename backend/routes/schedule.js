// Schedule & Arrival routes. Owner: Ahmed (230102).
const express = require('express');
const controller = require('../controllers/schedule');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.put('/trips/:id/times', requireAuth, requireRole('admin'), controller.setStopTimes);
router.get('/trips/:id/eta', requireAuth, controller.getEta);
router.post('/students', requireAuth, requireRole('admin'), controller.linkStudent);
router.post('/trips/:id/attendance', requireAuth, requireRole('supervisor'), controller.markAttendance);
router.patch('/attendance/:id', requireAuth, requireRole('supervisor', 'admin'), controller.fixAttendance);
router.get('/trips/:id/attendance', requireAuth, requireRole('admin', 'supervisor', 'parent'), controller.viewAttendance);

module.exports = router;
