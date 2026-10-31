const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const standalone = path.join(root, '.next/standalone');
assert(fs.existsSync(path.join(standalone, 'server.js')));
assert(fs.existsSync(path.join(root, '.next/static/.keep')));
assert(fs.existsSync(path.join(root, 'public/.keep')));
assert.equal(fs.readFileSync(path.join(standalone, 'index.js'), 'utf8'), fs.readFileSync(path.join(root, 'index.js'), 'utf8'));
assert.equal(require('../package.json').scripts.start, 'node index.js');
assert.equal(require('../package.json').scripts['start:prod'], 'node server.js');
assert.equal(JSON.parse(fs.readFileSync(path.join(standalone, 'package.json'))).scripts['start:prod'], 'node server.js');
assert.equal(require('../next.config.js').output, 'standalone');
for (const name of ['axios', 'express', 'ipaddr.js', 'ws']) {
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(name)})`], { cwd: standalone, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
// Packaging must not collect credentials, generated state, git history or local tools.
for (const name of ['.git', '.env', 'auth.json', 'data', 'bk-data', 'telegram', 'verify-layout.cjs']) {
  assert(!fs.existsSync(path.join(standalone, name)), 'Unexpected private/runtime content: ' + name);
}
// Isolate the generated launcher to verify invocation and port handling without
// making network requests or downloading engines during this unit check.
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-launcher-'));
try {
  fs.copyFileSync(path.join(standalone, 'server.js'), path.join(fixture, 'server.js'));
  fs.writeFileSync(path.join(fixture, 'index.js'), "exports.BK_CONFIG={port:process.env.PORT};exports.startGate=async c=>console.log(JSON.stringify(c));");
  for (const [port, serverPort, expected] of [['', '', '3000'], ['4567', '', '4567'], ['', '4568', '4568']]) {
    const result = spawnSync(process.execPath, ['server.js'], { cwd: fixture, env: { ...process.env, PORT: port, SERVER_PORT: serverPort }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).port, expected);
  }
} finally { fs.rmSync(fixture, { recursive: true, force: true }); }
console.log('PASS: standalone contents, production dependencies, clean packaging, launcher ports and unchanged Node.js start command.');
