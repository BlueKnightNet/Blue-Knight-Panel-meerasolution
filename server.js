'use strict';
// Entry point used by Next.js-style container templates. Plain Node.js keeps
// using npm start -> index.js with its existing PORT behavior.
process.env.PORT = process.env.PORT || process.env.SERVER_PORT || '3000';
const { BK_CONFIG, startGate } = require('./index.js');
startGate(BK_CONFIG).catch(error => {
  console.error('[FATAL] Failed to start Blue Knight Gate:', error);
  process.exit(1);
});
