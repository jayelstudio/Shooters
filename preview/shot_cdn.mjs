import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

// Renders a CDN-importmap page (like tuner.html) offline by routing
// jsdelivr three@0.161.0 requests to the local node_modules copy.

const PORT = process.env.PORT || 8200;
const out = process.argv[2] || 'preview/out.png';
const page = process.argv[3] || 'preview/tuner.html';
const extra = process.argv[4] || '';
const W = parseInt(process.argv[5] || '1100', 10);
const H = parseInt(process.argv[6] || '820', 10);

const PREFIX = 'https://cdn.jsdelivr.net/npm/three@0.161.0/';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const pg = await browser.newPage({ viewport: { width: W, height: H } });
pg.on('pageerror', (e) => console.log('[pageerror]', e.message));
pg.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });

await pg.route('**/cdn.jsdelivr.net/npm/three@0.161.0/**', async (route) => {
  const url = route.request().url();
  const rel = url.slice(url.indexOf(PREFIX) + PREFIX.length).split('?')[0];
  try {
    const body = await readFile('node_modules/three/' + rel);
    route.fulfill({ status: 200, headers: { 'content-type': 'application/javascript' }, body });
  } catch (e) {
    console.log('[route miss]', rel, e.message);
    route.fulfill({ status: 404, body: 'not found' });
  }
});

const url = `http://localhost:${PORT}/${page}${extra ? '?' + extra : ''}`;
await pg.goto(url, { waitUntil: 'load' });
await pg.waitForFunction('window.__ready === true', { timeout: 20000 }).catch(() => console.log('timeout'));
await pg.waitForTimeout(600);
await pg.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
