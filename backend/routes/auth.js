// Signup / Login routes. Owner: Whole team.
const express = require('express');
const controller = require('../controllers/auth');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/users', controller.register);
router.post('/sessions', controller.login);
router.delete('/sessions/current', requireAuth, controller.logout);
router.post('/supervisors', requireAuth, requireRole('admin'), controller.createSupervisor);

module.exports = router;
