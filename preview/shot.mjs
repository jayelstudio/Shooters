import { chromium } from 'playwright-core';

const PORT = process.env.PORT || 8200;
const p = encodeURIComponent(process.argv[2] || 'null'); // JSON params
const out = process.argv[3] || 'preview/out.png';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${PORT}/preview/glove.html?p=${p}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 15000 }).catch(() => console.log('timeout waiting ready'));
await page.locator('#c').screenshot({ path: out });
await browser.close();
console.log('wrote', out);
