/**
 * Smoke test for the production bundle.
 *
 * The dev server and the built bundle are different artifacts — minification,
 * tree-shaking and asset hashing all happen only in the build — so "it works in
 * dev" is not evidence that a deploy will work. This drives the real bundle.
 *
 * Usage: pnpm preview --port 4173, then node tests/verify/prodcheck.mjs
 */
import { chromium } from '@playwright/test';
import { CHROMIUM_ARGS } from './shoot.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/';

const browser = await chromium.launch({ args: CHROMIUM_ARGS });
// The LAN certificate is self-signed by design, so certificate errors are
// expected here and are not what this check is looking for.
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();
const errs = [];
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
});
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e)));

await page.addInitScript(() => {
  try {
    localStorage.setItem('terra.onboarded', '1');
  } catch {
    /* ignore */
  }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForFunction(() => window.__terra?.ready(), null, { timeout: 60_000 });
await page.evaluate(() => window.__terra.idle());
await page.waitForTimeout(4000);

const stats = await page.evaluate(() => window.__terra.stats);
const debug = await page.evaluate(() => window.__terra.debug());
const real = errs.filter((e) => !/ws:\/\/localhost|\[vite\]/.test(e));

// A secure context is precisely what gates the Geolocation API, so it is worth
// asserting directly rather than inferring it from the scheme.
const environment = await page.evaluate(() => ({
  secureContext: window.isSecureContext,
  geolocation: 'geolocation' in navigator,
}));

console.log('url:', URL);
console.log('secure context:', environment.secureContext, '(gates GPS)');
console.log('geolocation API:', environment.geolocation);
console.log('stats:', JSON.stringify(stats));
console.log('fog coverage pixels:', debug.coverage?.nonZero, '/', debug.coverage?.total);
console.log('errors:', real.length ? real.slice(0, 5) : 'none');

await page.screenshot({ path: 'artifacts/screenshots/production-build.png' });
console.log('screenshot: artifacts/screenshots/production-build.png');

await browser.close();
process.exit(real.length ? 1 : 0);
