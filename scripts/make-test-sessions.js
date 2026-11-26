// Makes 4 test logins on Floci until Ahmed's login is used end to end:
//   parent1 (the main test parent), parent2 (for the ownership tests),
//   admin and supervisor (for the role tests).
// Run: node scripts/make-test-sessions.js
//
// It puts the users into Users and their sessions into Sessions (Ahmed's design:
// the session id IS the SHA-256 hash of the token, expires_at is Unix seconds).
// The raw tokens are written only to ../test-tokens.txt, outside the repo.
// They are never printed and never committed.
const { TEST_MARK } = require('./floci-env');
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../db/dynamo');
const { TABLES } = require('../db/tables');
const { hashToken } = require('../middleware/auth');

const TOKENS_FILE = path.join(__dirname, '..', '..', 'test-tokens.txt');
const SEVEN_DAYS = 7 * 24 * 60 * 60;

const users = [
  { key: 'PARENT1', id: '11111111-1111-4111-8111-111111111111', name: 'Test Parent 1', email: 'parent1@test.local', role: 'parent' },
  { key: 'PARENT2', id: '22222222-2222-4222-8222-222222222222', name: 'Test Parent 2', email: 'parent2@test.local', role: 'parent' },
  { key: 'ADMIN', id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Test Admin', email: 'admin@test.local', role: 'admin' },
  // Supervisor marks attendance in Ahmed's service. Here it proves the role check:
  // favorites and alerts are parent-only, holidays are open to any logged-in role.
  { key: 'SUPERVISOR', id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Test Supervisor', email: 'supervisor@test.local', role: 'supervisor' }
];

async function main() {
  const now = new Date();
  const expiresAt = Math.floor(now.getTime() / 1000) + SEVEN_DAYS;
  const lines = [];

  for (const user of users) {
    await db.send(new PutCommand({
      TableName: TABLES.users,
      Item: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: now.toISOString(),
        test_data: TEST_MARK
      }
    }));

    const token = randomBytes(32).toString('hex');
    const hash = hashToken(token);
    await db.send(new PutCommand({
      TableName: TABLES.sessions,
      Item: {
        id: hash,
        token_hash: hash,
        user_id: user.id,
        expires_at: expiresAt,
        created_at: now.toISOString(),
        test_data: TEST_MARK
      }
    }));
    lines.push(`${user.key}_TOKEN=${token}`);
  }

  fs.writeFileSync(TOKENS_FILE, `${lines.join('\n')}\n`);
  console.log(`Made ${users.length} users and sessions (valid 7 days). Tokens saved to ${TOKENS_FILE}`);
}

main().catch((err) => {
  console.error(`make-test-sessions failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
