// Checks what Yehia's trips table actually has in this Neon database.
// Run: node scripts/check-trips-columns.js
// It loads DATABASE_URL from .env and never prints it.
require('dotenv').config();
const sql = require('../db');

async function main() {
  const rows = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'trips'
    ORDER BY ordinal_position
  `;
  if (rows.length === 0) {
    console.log('There is no trips table in this database yet.');
    return;
  }
  const names = rows.map((row) => row.column_name);
  console.log(`trips columns: ${names.join(', ')}`);
  console.log(names.includes('service_date')
    ? 'service_date is there: the arrival query filters on today.'
    : 'service_date is MISSING: the service falls back to a query without the date filter.');
}

main().catch((err) => {
  console.error(`Check failed: ${err.message}`);
  process.exit(1);
});
