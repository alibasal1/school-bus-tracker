// Deletes only the items that make-test-sessions.js and seed-floci.js created
// on Floci (the ones with test_data = "favorites-alerts-test-data").
// Nothing else is touched: not a teammate's routes, not a real user's data.
// Run: node scripts/cleanup-test-data.js
const { TEST_MARK } = require('./floci-env');
const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../db/dynamo');
const { scanAll } = require('../db/pages');
const { TABLES } = require('../db/tables');

const KEYS = {
  [TABLES.tripStops]: ['trip_id', 'stop_id']
};

async function main() {
  const tables = [TABLES.sessions, TABLES.users, TABLES.tripStops, TABLES.trips, TABLES.stops, TABLES.routes];
  for (const TableName of tables) {
    const items = await scanAll({
      TableName,
      FilterExpression: 'test_data = :mark',
      ExpressionAttributeValues: { ':mark': TEST_MARK }
    });
    const keyNames = KEYS[TableName] || ['id'];
    for (const item of items) {
      const Key = Object.fromEntries(keyNames.map((name) => [name, item[name]]));
      await db.send(new DeleteCommand({ TableName, Key }));
    }
    console.log(`   ${TableName}: deleted ${items.length} test items`);
  }
}

main().catch((err) => {
  console.error(`cleanup-test-data failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
