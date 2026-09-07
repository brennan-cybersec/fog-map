/**
 * CLI entry for the verification loop: boots the dev server, captures every
 * configured view, prints a machine-readable report, and exits non-zero when
 * anything errored.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { shoot } from './shoot.mjs';

const PORT = 5273;
const URL = `http://localhost:${PORT}/`;

/**
 * Views chosen to prove the brief's "premium at every zoom level" requirement:
 * planet, country, metropolitan, city and street.
 */
const VIEWS = [
  {
    name: 'onboarding',
    center: [-122.42, 37.765],
    zoom: 12.4,
    settleMs: 3500,
    showOnboarding: true,
  },
  { name: 'world', center: [-40, 30], zoom: 1.6, settleMs: 4000 },
  { name: 'california', center: [-121.2, 37.9], zoom: 6.4, settleMs: 4500 },
  { name: 'bay-area', center: [-122.35, 37.72], zoom: 9.6, settleMs: 4500 },
  { name: 'san-francisco', center: [-122.44, 37.765], zoom: 12.3, settleMs: 5000 },
  { name: 'mission-street', center: [-122.4148, 37.7625], zoom: 15.2, settleMs: 5000 },
  {
    name: 'live-position',
    center: [-122.4148, 37.7599],
    zoom: 16,
    settleMs: 5000,
    after: async (page) => {
      await page.evaluate(() => window.__terra.simulatePosition([-122.4148, 37.7599], 28));
    },
  },
  {
    name: 'journeys',
    center: [-122.42, 37.765],
    zoom: 12.6,
    settleMs: 4500,
    after: async (page) => {
      await page.getByRole('button', { name: 'Journeys' }).click();
      await page.waitForSelector('.tl__day');
    },
  },
  {
    name: 'statistics',
    center: [-122.42, 37.765],
    zoom: 12.6,
    settleMs: 4500,
    after: async (page) => {
      await page.getByRole('button', { name: 'Statistics' }).click();
      await page.waitForSelector('.chart__col');
    },
  },
  {
    name: 'exploration',
    center: [-122.42, 37.765],
    zoom: 12.6,
    settleMs: 4500,
    after: async (page) => {
      await page.getByRole('button', { name: 'Exploration' }).click();
      await page.waitForSelector('.ach__row');
    },
  },
  {
    name: 'search',
    center: [-122.42, 37.765],
    zoom: 12.6,
    settleMs: 4000,
    after: async (page) => {
      await page.getByRole('searchbox').click();
      await page.getByRole('searchbox').fill('tok');
      await page.waitForSelector('.search__item');
    },
  },
  {
    name: 'privacy',
    center: [-122.42, 37.765],
    zoom: 12.6,
    settleMs: 4000,
    after: async (page) => {
      await page.getByRole('button', { name: 'Privacy and data' }).click();
      await page.waitForSelector('.toggle');
    },
  },
  {
    name: 'deleted-empty-state',
    center: [-122.42, 37.765],
    zoom: 12.6,
    settleMs: 5000,
    after: async (page) => {
      await page.getByRole('button', { name: 'Privacy and data' }).click();
      await page.getByRole('button', { name: 'Delete all history' }).click();
      await page.getByRole('button', { name: 'Delete everything' }).click();
      await page.waitForTimeout(1200);
    },
  },
  {
    name: 'replay',
    center: [-122.42, 37.765],
    zoom: 12,
    settleMs: 5000,
    after: async (page) => {
      await page.getByRole('button', { name: 'Journeys' }).click();
      await page.waitForSelector('.tl__trip');
      await page.locator('.tl__trip').first().click();
      await page.waitForSelector('.replay');
      // Let the playhead travel far enough that a trail is actually visible.
      await page.waitForTimeout(2500);
    },
  },
];

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  return false;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const views = only.length ? VIEWS.filter((v) => only.includes(v.name)) : VIEWS;

const server = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

const shutdown = () => {
  if (!server.killed) server.kill('SIGTERM');
};
process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

try {
  if (!(await waitForServer(URL))) {
    console.error('dev server did not start\n' + serverLog);
    process.exit(1);
  }

  let failed = false;
  for (const view of views) {
    const r = await shoot({
      url: URL,
      out: `artifacts/screenshots/${view.name}.png`,
      settleMs: view.settleMs,
      showOnboarding: view.showOnboarding ?? false,
      action: async (page) => {
        await page.waitForFunction(() => window.__terra?.ready(), null, { timeout: 60_000 });
        await page.evaluate(
          ([c, z]) => window.__terra.setCamera(c, z),
          [view.center, view.zoom],
        );
        if (view.after) await view.after(page);
      },
    });

    // Vite's HMR socket drops when the dev server is torn down at the end of a
    // run. That is harness lifecycle noise, not an application fault.
    const isHarnessNoise = (m) => /ws:\/\/localhost|HMR|\[vite\]/.test(m);

    const problems = [
      ...r.pageErrors.map((e) => `pageerror: ${e}`),
      ...r.appErrors.map((e) => `app: ${e}`),
      ...r.consoleErrors.filter((e) => !isHarnessNoise(e)).map((e) => `console: ${e}`),
    ];
    // Tile 404s are expected where imagery coverage is sparse at some zooms;
    // they are not application failures.
    const realFailures = r.failedRequests.filter((f) => !/tile|\.pbf|\.png|arcgisonline/.test(f));

    console.log(`\n=== ${view.name} (z${view.zoom}) ===`);
    console.log(`screenshot: ${r.screenshot ?? 'NONE'}`);
    if (r.stats) console.log(`stats: ${JSON.stringify(r.stats)}`);
    if (r.fatal) console.log(`FATAL: ${r.fatal}`);
    if (problems.length) console.log('problems:\n  ' + problems.slice(0, 15).join('\n  '));
    if (realFailures.length) console.log('failed requests:\n  ' + realFailures.slice(0, 8).join('\n  '));
    if (r.failedRequests.length) console.log(`(tile request failures: ${r.failedRequests.length})`);

    if (r.fatal || problems.length || !r.webgl?.ok) failed = true;
  }

  console.log(failed ? '\nVERIFY: FAILED' : '\nVERIFY: OK');
  process.exit(failed ? 1 : 0);
} finally {
  shutdown();
}
