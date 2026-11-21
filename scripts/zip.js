// npm run zip -> makes lambda.zip for AWS Lambda.
// It copies only the app files, installs only the runtime libraries (no jest),
// and never includes .env, where secrets live.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const bestzip = require('bestzip');

const root = path.join(__dirname, '..');
const build = path.join(root, 'build');
const files = ['app.js', 'lambda.js', 'package.json', 'package-lock.json',
  'controllers', 'routes', 'services', 'middleware', 'db'];

async function main() {
  fs.rmSync(build, { recursive: true, force: true });
  fs.mkdirSync(build);
  for (const f of files) fs.cpSync(path.join(root, f), path.join(build, f), { recursive: true });

  execSync('npm install --omit=dev --no-audit --no-fund', { cwd: build, stdio: 'inherit' });

  fs.rmSync(path.join(root, 'lambda.zip'), { force: true });
  // destination is relative to cwd, so spaces in the folder name do not matter
  await bestzip({ cwd: build, source: '*', destination: '../lambda.zip' });

  fs.rmSync(build, { recursive: true, force: true });
  console.log('Made lambda.zip');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
