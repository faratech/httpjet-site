// Shared puppeteer + Chrome lookup for render.js / check.js / shot.js.
// puppeteer: PUPPETEER_PATH, else normal resolution from this directory (docs-src/node_modules,
// <checkout>/node_modules, ... — which reaches /web/node_modules when the checkout is /web/httpjet),
// else /web/node_modules/puppeteer.
// Chrome: CHROME_PATH, else /usr/bin/google-chrome if present, else puppeteer's own download.
const fs = require('fs');

function loadPuppeteer() {
  if (process.env.PUPPETEER_PATH) return require(process.env.PUPPETEER_PATH);
  try { return require('puppeteer'); } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    return require('/web/node_modules/puppeteer');
  }
}

const SYSTEM_CHROME = '/usr/bin/google-chrome';
const executablePath = process.env.CHROME_PATH || (fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : undefined);

module.exports = { puppeteer: loadPuppeteer(), executablePath };
