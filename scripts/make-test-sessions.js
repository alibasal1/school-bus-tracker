// Makes 3 test logins until Ahmed's login page is ready:
//   parent1 (the seed parent), parent2 (for the ownership test), admin (for the 403 test).
// Run: node scripts/make-test-sessions.js
// It prints SQL to paste in the Neon SQL Editor, and the tokens to use in Postman / curl.
// The tokens are printed here only. The database stores only their SHA-256 hash.
// Never commit the printed tokens.
const { randomBytes, createHash } = require('crypto');

const users = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Test Parent 1', email: 'parent1@test.local', role: 'parent' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Test Parent 2', email: 'parent2@test.local', role: 'parent' },
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Test Admin', email: 'admin@test.local', role: 'admin' },
];

const sqlLines = [];
const tokens = [];
for (const u of users) {
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token, 'utf8').digest('hex');
  tokens.push(`${u.email.split('@')[0].toUpperCase()}_TOKEN=${token}`);
  sqlLines.push(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES ('${u.id}', '${u.name}', '${u.email}', 'not-used', '${u.role}') ON CONFLICT (id) DO NOTHING;`,
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ('${u.id}', '${hash}', now() + interval '30 days');`
  );
}

console.log('--- 1. Paste this in the Neon SQL Editor and press Run ---\n');
console.log(sqlLines.join('\n'));
console.log('\n--- 2. Keep these tokens for testing (do not share or commit them) ---\n');
console.log(tokens.join('\n'));
