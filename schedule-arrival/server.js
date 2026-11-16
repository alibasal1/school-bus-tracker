require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./middleware/logger');

// Schedule & Arrival + Signup / Login API. Owner: Ahmed (230102).
const app = express();

const allowed = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

app.use(logger);
app.use(express.json());
app.use(cors({ origin: allowed }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'schedule-arrival' }));

// Signup / Login (lead: Ahmed)
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/schedule'));

app.use((req, res) => {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Endpoint not found.' } });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Schedule & Arrival + Signup / Login API running on http://localhost:${PORT}`));

module.exports = app;
