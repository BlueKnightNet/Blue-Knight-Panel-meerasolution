'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');

function createManager({ dataDir, allocatePort, spawnChild = spawn }) {
  const token = crypto.randomBytes(32).toString('hex');
  let port, child, stopping = false, attempts = 0, timer;
  const state = { status: 'starting', error: null };
  async function start() {
    if (stopping) return;
    try {
      const ports = await Promise.all(Array.from({ length: 5 }, () => allocatePort()));
      [port] = ports;
      child = spawnChild(process.env.PYTHON_BIN || 'python3', ['-u', path.join(__dirname, 'service.py')], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, BK_TELEGRAM_TOKEN: token, BK_TELEGRAM_PORT: String(port),
          BK_TELEGRAM_DATA: path.join(dataDir, 'telegram'),
          MTPROTO_PORT: String(ports[1]), METRICS_PORT: String(ports[2]),
          TELEMT_API_PORT: String(ports[3]), WEB_LISTEN_PORT: String(ports[4]),
          TCP_ROUTER_PROXY_PROTOCOL: '1', PANEL_PERSISTENT_DATA: '1',
          SERVER_PORT: '0', PUBLIC_PORT: '0', PANEL_PUBLIC_ORIGIN: '', PANEL_PUBLIC_DOMAIN: '',
          SECRET: '', FAKE_TLS_HOST: 'www.cloudflare.com' }
      });
      let ended = false;
      const failed = message => {
        if (ended) return;
        ended = true;
        state.status = 'unavailable'; state.error = message;
        if (!stopping && ++attempts < 4) timer = setTimeout(start, 30000);
      };
      child.stdout.on('data', chunk => {
        const line = String(chunk).trim();
        if (line.includes('Private adapter started')) { state.status = 'running'; state.error = null; }
        console.log('[telegram] ' + line);
      });
      child.stderr.on('data', () => { /* Do not forward engine configuration or secrets to panel logs. */ });
      child.once('error', () => failed('Python 3 is unavailable. Use this repository’s Docker deployment; V2Ray configs remain available.'));
      child.once('exit', () => failed('Telegram engine stopped. Check the Docker runtime and outbound network access.'));
    } catch (error) { state.status = 'unavailable'; state.error = error.message; }
  }
  if (process.env.BK_TELEGRAM_ENABLED === 'false') {
    state.status = 'disabled'; state.error = 'Telegram integration disabled by BK_TELEGRAM_ENABLED.';
  } else start();

  function stop() { stopping = true; clearTimeout(timer); if (child) child.kill('SIGTERM'); }
  function relay(req, res, destination, { method = req.method, body, timeout = 50000, bridge = false } = {}) {
    if (!port || state.status !== 'running') {
      return res.status(503).json({ ok: false, ...state, error: state.error || 'Telegram engine is starting. Refresh in a moment.' });
    }
    const headers = bridge ? Object.fromEntries(Object.entries(req.headers).filter(([key]) => !['host', 'cookie', 'authorization', 'connection', 'transfer-encoding', 'x-telegram-adapter'].includes(key.toLowerCase()))) : {};
    headers['x-telegram-adapter'] = token;
    headers.connection = 'close';
    if (body !== undefined) {
      body = Buffer.from(JSON.stringify(body));
      headers['content-type'] = 'application/json'; headers['content-length'] = body.length;
    }
    const upstream = http.request({ hostname: '127.0.0.1', port, path: destination, method, headers, agent: false }, response => {
      res.status(response.statusCode);
      for (const name of ['content-type', 'content-disposition', 'content-length']) if (response.headers[name]) res.setHeader(name, response.headers[name]);
      res.setHeader('Cache-Control', 'no-store');
      response.on('error', () => res.destroy()); response.pipe(res);
    });
    upstream.setTimeout(timeout, () => upstream.destroy(new Error('Telegram request timed out')));
    upstream.on('error', () => {
      if (!res.headersSent) res.status(502).json({ ok: false, error: 'Telegram service unavailable. V2Ray configs are independent.' });
      else res.destroy();
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    if (body !== undefined) upstream.end(body); else if (bridge) req.pipe(upstream); else upstream.end();
  }
  return { state, relay, stop };
}

function attach({ app, express, panelPath, dataDir, allocatePort, sessionOnly, sameOrigin, getHost }) {
  const manager = createManager({ dataDir, allocatePort });
  const api = '/' + panelPath + '/api/telegram';
  app.get('/knight-assets/telegram.js', sessionOnly, (_req, res) => res.sendFile(path.join(__dirname, 'ui.js')));
  app.get(api + '/status', sessionOnly, (req, res) => manager.relay(req, res, '/status'));
  app.post(api + '/bridge', sessionOnly, sameOrigin, express.json({ limit: '8kb' }), (req, res) => manager.relay(req, res, '/bridge', { body: req.body }));
  app.post(api + '/settings', sessionOnly, sameOrigin, express.json({ limit: '8kb' }), (req, res) => manager.relay(req, res, '/settings', { body: req.body }));
  app.post(api + '/worker', sessionOnly, sameOrigin, express.json({ limit: '8kb' }), (req, res) => manager.relay(req, res, '/worker', { body: { origin: 'https://' + getHost(req) } }));
  // Public carrier endpoint: the private adapter validates the deployment's Worker token.
  app.use('/_webbridge', (req, res) => {
    if (!['GET', 'HEAD', 'POST', 'DELETE'].includes(req.method)) return res.sendStatus(405);
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) > 1048576) return res.sendStatus(413);
    manager.relay(req, res, req.originalUrl, { bridge: true });
  });
  process.once('exit', manager.stop);
  process.once('SIGTERM', () => { manager.stop(); process.exit(0); });
  process.once('SIGINT', () => { manager.stop(); process.exit(0); });
  return manager;
}

module.exports = { attach, createManager };
