import { chromium } from 'playwright-core';

const PORT = process.env.PORT || 8200;
const out = process.argv[2] || 'preview/out.png';
const view = process.argv[3] || 'grip';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${PORT}/preview/glove.html?view=${view}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 15000 }).catch(() => console.log('timeout'));
await page.locator('#c').screenshot({ path: out });
await browser.close();
console.log('wrote', out);
