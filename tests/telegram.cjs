const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { createManager } = require('../telegram/integration.cjs');
const express = require('express');
const { attach } = require('../telegram/integration.cjs');
const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
const m = new Module(path.join(__dirname, '../index.js'));
m.filename = path.join(__dirname, '../index.js'); m.paths = module.paths;
m._compile(source + '\nmodule.exports.assets=EMBEDDED_ASSETS;module.exports.panel={createHttpPanel,buildConfig};', m.filename);
assert.equal((m.exports.assets.indexHtml.match(/data-page="telegram"/g) || []).length, 3);
assert(m.exports.assets.appJs.includes("targetViewId = 'viewTelegram'"));
new (require('node:vm').Script)(fs.readFileSync(path.join(__dirname, '../telegram/ui.js'), 'utf8'));

(async () => {
  const manager = createManager({ dataDir: '.', allocatePort: async () => 12345, spawnChild: () => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.kill = () => {}; queueMicrotask(() => child.emit('error', new Error('missing python'))); return child;
  }});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.state.status, 'unavailable');
  manager.stop();
  process.env.BK_TELEGRAM_ENABLED = 'false';
  const app = express();
  const service = attach({ app, express, panelPath: 'custom', dataDir: '.', allocatePort: async () => 0,
    sessionOnly: (req, res, next) => req.headers.cookie === 'owner=yes' ? next() : res.sendStatus(401),
    sameOrigin: (req, res, next) => req.get('x-bk-req') === '1' ? next() : res.sendStatus(403), getHost: () => 'app.deploy.meerasolution.com' });
  app.get('/v2ray-still-works', (_req, res) => res.send('ok'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const request = (url, method = 'GET', headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end();
  });
  try {
    assert.equal(await request('/custom/api/telegram/status'), 401);
    assert.equal(await request('/custom/api/telegram/status?token=subscription-only'), 401);
    assert.equal(await request('/custom/api/telegram/worker', 'POST', { cookie: 'owner=yes' }), 403);
    assert.equal(await request('/custom/api/telegram/status', 'GET', { cookie: 'owner=yes' }), 503);
    assert.equal(await request('/_webbridge/session', 'PUT'), 405);
    assert.equal(await request('/v2ray-still-works'), 200);
  } finally { service.stop(); await new Promise(resolve => server.close(resolve)); }
  const os = require('node:os');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-telegram-auth-'));
  process.env.BK_DATA_DIR = directory;
  const config = m.exports.panel.buildConfig({});
  const panel = m.exports.panel.createHttpPanel(config, { paths: config.paths, state: { uuid: '11111111-1111-4111-8111-111111111111' }, save() {} }, () => ({}), () => 'localhost');
  await new Promise(resolve => panel.server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + panel.server.address().port + '/' + config.panelPath;
    const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=local-test-password&confirm=local-test-password' });
    assert.equal(login.status, 302);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const auth = JSON.parse(fs.readFileSync(path.join(directory, 'auth.json')));
    assert.equal((await fetch(base + '/api/telegram/status?token=' + auth.subToken)).status, 401);
    assert.equal((await fetch(base + '/api/telegram/status', { headers: { cookie } })).status, 503);
    assert.equal((await fetch(base + '/api/telegram/worker', { method: 'POST', headers: { cookie } })).status, 403);
    const original = await fetch(base + '/base64?token=' + auth.subToken, { headers: { 'X-Forwarded-Host': 'own-app.deploy.meerasolution.com' } });
    assert.equal(original.status, 200);
    assert(Buffer.from(await original.text(), 'base64').toString().includes('own-app.deploy.meerasolution.com:443'));
  } finally { await new Promise(resolve => panel.server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); }
  console.log('PASS: real panel login, subscription-token isolation, CSRF boundary, disabled/missing runtime, custom panel paths, V2Ray subscription and tab scripts.');
})().catch(error => { console.error(error); process.exitCode = 1; });
