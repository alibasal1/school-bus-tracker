// Shared setup for the test-data scripts. They only ever run against Floci on
// this PC, never real AWS: the endpoint must be localhost, or the script stops.
// Must be required before db/dynamo.js, because the client reads these values.
require('dotenv').config();

process.env.AWS_PROFILE = process.env.AWS_PROFILE || 'floci';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.AWS_ENDPOINT_URL = process.env.AWS_ENDPOINT_URL || 'http://localhost:4566';

const host = new URL(process.env.AWS_ENDPOINT_URL).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to write test data to a non-local AWS endpoint (${host}).`);
  process.exit(1);
}

// Every item these scripts create carries this mark, so cleanup-test-data.js
// can delete exactly them and nothing that a real user or teammate created.
const TEST_MARK = 'favorites-alerts-test-data';

module.exports = { TEST_MARK };
