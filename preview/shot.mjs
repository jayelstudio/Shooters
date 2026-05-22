import { chromium } from 'playwright-core';

const PORT = process.env.PORT || 8200;
const out = process.argv[2] || 'preview/out.png';
const view = process.argv[3] || 'grip';
const page = process.argv[4] || 'preview/glove.html';
const extra = process.argv[5] || '';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const pg = await browser.newPage({ viewport: { width: 720, height: 1000 } });
pg.on('pageerror', (e) => console.log('[pageerror]', e.message));
const url = `http://localhost:${PORT}/${page}?view=${view}${extra ? '&' + extra : ''}`;
await pg.goto(url, { waitUntil: 'load' });
await pg.waitForFunction('window.__ready === true', { timeout: 15000 }).catch(() => console.log('timeout'));
await pg.locator('#c').screenshot({ path: out });
await browser.close();
console.log('wrote', out);
