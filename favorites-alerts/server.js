// Runs the API on your PC (npm run dev).
require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`Favorites & Alerts API running on http://localhost:${PORT}`));
