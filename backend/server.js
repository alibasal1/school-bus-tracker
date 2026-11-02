require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./middleware/logger');

const app = express();

const allowed = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

app.use(logger);
app.use(express.json());
app.use(cors({ origin: allowed }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Shared login (whole team)
app.use('/api', require('./routes/auth'));
// Service 1: Route & Stop (Yehia)
app.use('/api', require('./routes/routes'));
// Service 2: Schedule & Arrival (Ahmed)
app.use('/api', require('./routes/schedule'));
// Service 3: Favorites & Alerts (Ali)
app.use('/api', require('./routes/favorites'));

app.use((req, res) => {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Endpoint not found.' } });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));

module.exports = app;
