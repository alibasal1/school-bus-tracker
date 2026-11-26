// Creates the DynamoDB tables this service needs, if they are not there yet.
// Run by infra/deploy.sh:  node scripts/create-tables.js <kms-key-arn>
//
// The schema is the same as Ahmed's scripts/provision/dynamodb.js (all keys are
// strings, PAY_PER_REQUEST), so if his provisioning runs first or later on the
// same Floci, nothing conflicts: an existing table is never changed or deleted.
const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTableCommand
} = require('@aws-sdk/client-dynamodb');

const endpoint = process.env.AWS_ENDPOINT_URL;
const client = new DynamoDBClient(endpoint ? { endpoint } : {});
const kmsKeyArn = process.argv[2];

function index(name, key) {
  return { IndexName: name, KeySchema: [{ AttributeName: key, KeyType: 'HASH' }], Projection: { ProjectionType: 'ALL' } };
}

function table(name, { partitionKey = 'id', sortKey, indexes = [], mine = false } = {}) {
  const keys = new Set([partitionKey, ...(sortKey ? [sortKey] : [])]);
  for (const gsi of indexes) keys.add(gsi.KeySchema[0].AttributeName);
  return {
    mine,
    definition: {
      TableName: name,
      AttributeDefinitions: [...keys].map((AttributeName) => ({ AttributeName, AttributeType: 'S' })),
      KeySchema: [
        { AttributeName: partitionKey, KeyType: 'HASH' },
        ...(sortKey ? [{ AttributeName: sortKey, KeyType: 'RANGE' }] : [])
      ],
      ...(indexes.length ? { GlobalSecondaryIndexes: indexes } : {}),
      BillingMode: 'PAY_PER_REQUEST'
    }
  };
}

const TABLES = [
  // Mine: this service reads and writes them.
  table('Favorites', { indexes: [index('user-id-index', 'user_id')], mine: true }),
  table('Alerts', { indexes: [index('user-id-index', 'user_id')], mine: true }),
  table('Holidays', { indexes: [index('date-index', 'date'), index('year-index', 'year')], mine: true }),
  table('ProcessedEvents', { partitionKey: 'event_id', mine: true }),
  // Ahmed's and Yehia's: created here only when missing, so this service also
  // works alone on a fresh Floci. Same keys and indexes as Ahmed's design.
  table('Users', { indexes: [index('email-index', 'email')] }),
  table('Sessions', { indexes: [index('token-hash-index', 'token_hash')] }),
  table('Routes', { indexes: [index('name-index', 'name'), index('area-index', 'area')] }),
  table('Stops', { indexes: [index('route-id-index', 'route_id')] }),
  table('Trips', { indexes: [index('route-id-index', 'route_id')] }),
  table('TripStops', { partitionKey: 'trip_id', sortKey: 'stop_id' })
];

async function describe(name) {
  try {
    return (await client.send(new DescribeTableCommand({ TableName: name }))).Table;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return null;
    throw err;
  }
}

async function waitActive(name) {
  for (let i = 0; i < 40; i += 1) {
    const found = await describe(name);
    if (found && found.TableStatus === 'ACTIVE') return found;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for table ${name}`);
}

// Encrypt my own tables with my KMS key (alias/favorites-alerts). If this AWS
// copy does not support it, say so and carry on: DynamoDB still encrypts every
// table at rest with an AWS-owned key by default.
async function encryptWithMyKey(found) {
  if (!kmsKeyArn) return 'no key given';
  const sse = found.SSEDescription;
  if (sse && sse.Status === 'ENABLED' && sse.KMSMasterKeyArn === kmsKeyArn) return 'already on';
  try {
    await client.send(new UpdateTableCommand({
      TableName: found.TableName,
      SSESpecification: { Enabled: true, SSEType: 'KMS', KMSMasterKeyId: kmsKeyArn }
    }));
    const after = (await waitActive(found.TableName)).SSEDescription;
    if (after && after.KMSMasterKeyArn === kmsKeyArn) return 'on';
    return 'not supported (accepted but not applied)';
  } catch (err) {
    return `not supported (${err.name})`;
  }
}

async function main() {
  for (const { definition, mine } of TABLES) {
    let found = await describe(definition.TableName);
    let state = 'exists';
    if (!found) {
      try {
        await client.send(new CreateTableCommand(definition));
        state = 'created';
      } catch (err) {
        if (err.name !== 'ResourceInUseException') throw err;
      }
      found = await waitActive(definition.TableName);
    }
    const sse = mine ? `, KMS encryption: ${await encryptWithMyKey(found)}` : ' (read only)';
    console.log(`   ${definition.TableName}: ${state}${sse}`);
  }
}

main().catch((err) => {
  console.error(`create-tables failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
