/**
 * Performance measurement.
 *
 * Drives a scripted pan/zoom over the full demo world and reports real frame
 * statistics.
 *
 * IMPORTANT: headless Chromium here renders WebGL through SwiftShader, a
 * software rasteriser with no GPU behind it. Absolute frame rates from this
 * harness are therefore a *floor*, not a prediction of real hardware. What it
 * genuinely catches is regression — a change that makes the software renderer
 * markedly slower will make real devices slower too — and pathological stalls.
 */

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { URL as NodeURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { CHROMIUM_ARGS, devServerUrl } from './shoot.mjs';

const PORT = 5273;
const URL = devServerUrl(PORT);

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Self-signed certificate locally, so verification is disabled for the
      // readiness probe only.
      const ok = await new Promise((resolve) => {
        const target = new NodeURL(url);
        const client = target.protocol === 'https:' ? https : http;
        const req = client.request(target, { timeout: 2000, rejectUnauthorized: false }, (res) => {
          res.resume();
          resolve((res.statusCode ?? 500) < 500);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      });
      if (ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  return false;
}

const server = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
const shutdown = () => {
  if (!server.killed) server.kill('SIGTERM');
};
process.on('exit', shutdown);

try {
  if (!(await waitForServer(URL))) {
    console.error('dev server did not start');
    process.exit(1);
  }

  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('terra.onboarded', '1');
    } catch {
      /* ignore */
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__terra?.ready(), null, { timeout: 60_000 });
  await page.evaluate(() => window.__terra.idle());
  await page.waitForTimeout(3000);

  const heapBefore = await page.evaluate(
    () => performance.memory?.usedJSHeapSize ?? null,
  );

  const stats = await page.evaluate(async () => {
    window.__terra.startFrameRecording();
    await window.__terra.runInteraction(6000);
    return window.__terra.stopFrameRecording();
  });

  // A second identical pass: if the heap climbs materially across two runs of
  // the same work, something is being retained per frame.
  const second = await page.evaluate(async () => {
    window.__terra.startFrameRecording();
    await window.__terra.runInteraction(6000);
    return window.__terra.stopFrameRecording();
  });

  const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);

  const mb = (b) => (b === null ? 'n/a' : `${(b / 1048576).toFixed(1)} MB`);

  console.log('\n=== frame timing (SwiftShader software renderer — a floor, not a prediction) ===');
  for (const [label, s] of [
    ['pass 1', stats],
    ['pass 2', second],
  ]) {
    console.log(
      `${label}: ${s.frames} frames · mean ${s.meanFps.toFixed(1)} fps · ` +
        `p95 ${s.p95FrameMs.toFixed(1)} ms · worst ${s.worstFrameMs.toFixed(1)} ms · ` +
        `jank ${(s.jankRatio * 100).toFixed(1)}%`,
    );
  }
  console.log(`heap: ${mb(heapBefore)} -> ${mb(heapAfter)}`);

  if (heapBefore !== null && heapAfter !== null) {
    const growthMb = (heapAfter - heapBefore) / 1048576;
    console.log(`heap growth across two identical passes: ${growthMb.toFixed(1)} MB`);
    if (growthMb > 60) console.log('WARNING: heap growth suggests per-frame retention');
  }

  await browser.close();
} finally {
  shutdown();
}
