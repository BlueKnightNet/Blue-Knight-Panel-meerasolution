'use strict';
// Package the existing proxy server for hosts whose Next.js template expects
// .next/standalone/server.js, .next/static and public. No framework server is
// placed in front of the TCP multiplexer or its WebSocket upgrade handlers.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.next');
const standalone = path.join(output, 'standalone');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

// Only this fixed, generated directory is replaced; /data and app state are not copied.
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(standalone, { recursive: true });
for (const name of ['index.js', 'orihost.cjs', 'package.json', 'package-lock.json']) {
  fs.copyFileSync(path.join(root, name), path.join(standalone, name));
}
for (const [relative, info] of Object.entries(lock.packages || {})) {
  if (!relative || info.dev || !relative.startsWith('node_modules/')) continue;
  const source = path.resolve(root, relative);
  const destination = path.resolve(standalone, relative);
  if (!source.startsWith(root + path.sep) || !destination.startsWith(standalone + path.sep)) throw new Error('Invalid dependency path');
  if (!fs.existsSync(source)) {
    if (info.optional) continue;
    throw new Error('Missing production dependency: ' + relative + '. Run npm ci before building.');
  }
  fs.cpSync(source, destination, { recursive: true });
}
fs.copyFileSync(path.join(root, 'server.js'), path.join(standalone, 'server.js'));
fs.mkdirSync(path.join(output, 'static'), { recursive: true });
fs.writeFileSync(path.join(output, 'static', '.keep'), 'Panel assets are embedded in index.js.\n');
fs.writeFileSync(path.join(output, 'BUILD_ID'), 'blue-knight-standalone\n');
// Some hosting templates copy public even though the panel embeds its own assets.
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', '.keep'), 'Panel assets are embedded in index.js.\n');
console.log('Built .next/standalone/server.js with the panel and production dependencies.');
