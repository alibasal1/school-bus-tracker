// Puts test routes on Floci so the service can be tried alone.
// Run: node scripts/seed-floci.js
//
// Only runs when the Routes table is empty: if Ahmed's or Yehia's seed already
// filled it, their data is used and nothing is added. Every item is marked as
// test data (test_data field), so cleanup-test-data.js removes exactly these.
// Field names follow Ahmed's seed (scripts/seed-data/routes.json).
const { TEST_MARK } = require('./floci-env');
const { PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../db/dynamo');
const { TABLES } = require('../db/tables');

const routes = [
  { id: 'test-route-1', code: 'TEST-R1', name: 'Test Route', area: 'Maadi' },
  { id: 'test-route-2', code: 'TEST-R2', name: 'Test Route Two', area: 'Nasr City' }
];

// Three stops per route, a morning and an afternoon trip per route, and a
// TripStops row (arrive_from / arrive_to, Cairo time) for every stop of each trip.
// The trips have no date: like Ahmed's, they run every school day, and
// cancelled_date marks a one-day cancellation.
const RUNS = [
  { run: 'am', runType: 'morning', start: 7 * 60 },
  { run: 'pm', runType: 'afternoon', start: 14 * 60 + 30 }
];
const STOP_NAMES = ['Stop One', 'Stop Two', 'Stop Three'];

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function itemsToSeed() {
  const items = [];
  routes.forEach((route, r) => {
    items.push([TABLES.routes, route]);
    STOP_NAMES.forEach((name, s) => {
      items.push([TABLES.stops, {
        id: `test-stop-${r + 1}-${s + 1}`,
        route_id: route.id,
        name: r === 0 ? `Test ${name}` : `Test ${name} (R2)`,
        stop_order: s + 1
      }]);
    });
    for (const { run, runType, start } of RUNS) {
      const tripId = `test-trip-${r + 1}-${run}`;
      items.push([TABLES.trips, { id: tripId, route_id: route.id, run_type: runType, status: 'scheduled', cancelled_date: null }]);
      STOP_NAMES.forEach((_, s) => {
        const from = start + s * 15;
        items.push([TABLES.tripStops, {
          trip_id: tripId,
          stop_id: `test-stop-${r + 1}-${s + 1}`,
          arrive_from: hhmm(from),
          arrive_to: hhmm(from + 10)
        }]);
      });
    }
  });
  return items;
}

async function main() {
  const existing = await db.send(new ScanCommand({ TableName: TABLES.routes, Limit: 1 }));
  if ((existing.Items || []).length > 0) {
    console.log('Routes already has data: nothing seeded.');
    return;
  }
  const items = itemsToSeed();
  for (const [TableName, item] of items) {
    await db.send(new PutCommand({ TableName, Item: { ...item, test_data: TEST_MARK } }));
  }
  console.log(`Seeded ${items.length} test items: 2 routes, 6 stops, 4 trips, 12 trip stops.`);
}

main().catch((err) => {
  console.error(`seed-floci failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
