'use strict';
const path = require('node:path');
const assigned = process.env.SERVER_PORT || process.env.PORT;
if (!/^\d+$/.test(assigned || '') || Number(assigned) < 1 || Number(assigned) > 65535) {
  console.error('Set SERVER_PORT to the primary port shown in Orihost Network/Allocations.');
  process.exit(1);
}
process.env.BK_HOSTING = 'orihost';
process.env.PORT = assigned;
process.env.BK_DATA_DIR = process.env.BK_DATA_DIR || process.env.FILE_PATH || path.join(process.cwd(), 'bk-data');
const { BK_CONFIG, startGate } = require('./index.js');
startGate(BK_CONFIG).catch(error => {
  console.error('[FATAL] Failed to start Blue Knight Gate:', error);
  process.exit(1);
});
