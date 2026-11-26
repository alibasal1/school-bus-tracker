// Table names, the same as Ahmed's config/table-names.js, so all three services
// read and write the same tables. All keys are strings.
const TABLES = Object.freeze({
  // Mine: read and write.
  favorites: 'Favorites',
  alerts: 'Alerts',
  holidays: 'Holidays',
  processedEvents: 'ProcessedEvents',
  // Other services own these. This service only reads them.
  users: 'Users',
  sessions: 'Sessions',
  routes: 'Routes',
  stops: 'Stops',
  trips: 'Trips',
  tripStops: 'TripStops'
});

module.exports = { TABLES };
