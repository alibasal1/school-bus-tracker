const { neon } = require('@neondatabase/serverless');

// One shared SQL helper. Values in ${} are sent as parameters (no SQL injection).
const sql = neon(process.env.DATABASE_URL);

module.exports = sql;
