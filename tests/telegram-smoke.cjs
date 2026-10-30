// Run against an isolated CI container, never an existing user deployment.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:18080';
const host = 'ci-own-app.deploy.meerasolution.com';
(async () => {
  const password = crypto.randomBytes(24).toString('hex');
  const login = await fetch(origin + '/knight/login', { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Host: host },
    body: new URLSearchParams({ password, confirm: password }) });
  assert.equal(login.status, 302);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, Host: host, 'X-BK-Req': '1', 'Content-Type': 'application/json' };
  assert.equal((await fetch(origin + '/knight/api/telegram/status')).status, 401);
  let status;
  for (let attempt = 0; attempt < 90; attempt++) {
    const response = await fetch(origin + '/knight/api/telegram/status', { headers });
    if (response.ok) {
      status = await response.json();
      if (status.running) break;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert(status?.running, 'Telemt did not become ready');
  assert.equal(status.network_ready, false);
  const worker = await fetch(origin + '/knight/api/telegram/worker', { method: 'POST', headers, body: '{}' });
  assert.equal(worker.status, 200);
  assert((await worker.text()).includes('https://' + host));
  const bridge = await fetch(origin + '/knight/api/telegram/bridge', { method: 'POST', headers,
    body: JSON.stringify({ enabled: true, worker_url: 'https://ci-worker.example.com', public_ip: '1.1.1.1' }) });
  assert.equal(bridge.status, 200, await bridge.text());
  const enabled = await (await fetch(origin + '/knight/api/telegram/status', { headers })).json();
  assert(enabled.running && enabled.bridge.enabled);
  assert(enabled.bridge.tg_link.startsWith('tg://webproxy?'));
  assert.equal((await fetch(origin + '/_webbridge/private-path')).status, 404);
  const health = await (await fetch(origin + '/health', { headers })).json();
  assert.equal(health.publicPort, 443);
  assert(health.engines.singbox || health.engines.singBox || Object.values(health.engines).some(Boolean));
  assert(health.nodes.some(node => node.uri?.startsWith('vless://')));
  console.log('PASS: shared login, native Telemt startup, WEB listener enable, private Worker generation, carrier token rejection and V2Ray health. No external Telegram connection was asserted.');
})().catch(error => { console.error(error); process.exitCode = 1; });
