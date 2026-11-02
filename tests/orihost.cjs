const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), Module = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const mod = new Module(path.join(root, 'index.js')); mod.filename = path.join(root, 'index.js'); mod.paths = module.paths;
mod._compile(fs.readFileSync(mod.filename, 'utf8') + '\nmodule.exports.test={buildConfig,LinkGenerator,createHttpPanel,resolveDataDir};', mod.filename);
const test = mod.exports.test, fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-orihost-'));
const previousCwd = process.cwd();
const keys = ['BK_HOSTING', 'P_SERVER_UUID', 'BK_DATA_DIR', 'FILE_PATH', 'PORT', 'SERVER_PORT', 'LINK_TLS', 'LINK_PORT', 'DOMAIN', 'FORCE_HOST', 'RAILWAY_PUBLIC_DOMAIN'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
(async () => {
  try {
    keys.forEach(key => delete process.env[key]);
    process.chdir(fixture); process.env.BK_HOSTING = 'orihost'; process.env.SERVER_PORT = '31234'; process.env.PORT = '3000';
    const config = test.buildConfig({});
    assert.equal(config.publicPort, 31234);
    assert.equal(config.paths.dataDir, path.join(fixture, 'bk-data'));
    let generator = new test.LinkGenerator(config, { uuid: '11111111-1111-4111-8111-111111111111' }, '8.8.8.8');
    assert.equal(generator.port, 31234); assert.equal(generator.edgeTls, false);
    const state = { paths: config.paths, state: { uuid: '11111111-1111-4111-8111-111111111111' }, save() {} };
    const { server } = test.createHttpPanel(config, state, () => ({}), () => '9.9.9.9');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const base = 'http://127.0.0.1:' + server.address().port + '/' + config.panelPath;
      const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=local-test-password&confirm=local-test-password' });
      assert.equal(login.status, 302);
      const response = await fetch(base + '/raw', { headers: { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-Forwarded-Host': '8.8.8.8:31234' } });
      assert.equal(response.status, 200); assert((await response.text()).includes('@8.8.8.8:31234'));
      assert.equal(state.state.publicHost, '8.8.8.8');
    } finally { await new Promise(resolve => server.close(resolve)); }
    delete process.env.BK_HOSTING; delete process.env.SERVER_PORT;
    assert.equal(test.buildConfig({}).publicPort, 3000);
    generator = new test.LinkGenerator(config, { uuid: state.state.uuid }, 'own-app.deploy.meerasolution.com');
    assert.equal(generator.port, 443); assert.equal(generator.edgeTls, true);
    fs.copyFileSync(path.join(root, 'orihost.cjs'), path.join(fixture, 'orihost.cjs'));
    fs.writeFileSync(path.join(fixture, 'index.js'), 'exports.BK_CONFIG={port:process.env.PORT,data:process.env.BK_DATA_DIR};exports.startGate=async c=>console.log(JSON.stringify(c));');
    let result = spawnSync(process.execPath, ['orihost.cjs'], { cwd: fixture, env: { ...process.env, SERVER_PORT: '31235', PORT: '3000' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).port, '31235');
    result = spawnSync(process.execPath, ['orihost.cjs'], { cwd: fixture, env: { ...process.env, SERVER_PORT: 'bad', PORT: '' }, encoding: 'utf8' });
    assert.equal(result.status, 1);
    console.log('PASS: allocated port priority, persistent data, authenticated allocation IP discovery, launcher validation and existing Meera/Node behavior.');
  } finally {
    process.chdir(previousCwd); keys.forEach(key => previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key]);
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
