/**
 * Verification harness.
 *
 * Launches the dev server, drives a real Chromium with GPU rasterization, waits
 * for the map to genuinely settle, then captures a screenshot plus every console
 * error, page exception and failed network request.
 *
 * Headless Chromium has no GPU, so WebGL is forced onto SwiftShader (ANGLE's
 * software rasterizer). That renders MapLibre correctly — just slowly — which is
 * what makes automated visual verification of a WebGL map possible at all.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
];

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.out            screenshot path
 * @param {[number, number]} [opts.viewport]
 * @param {number} [opts.settleMs]     extra wait after idle, for tile decode
 * @param {(page: import('@playwright/test').Page) => Promise<void>} [opts.action]
 */
export async function shoot(opts) {
  const {
    url,
    out,
    viewport = [1440, 900],
    settleMs = 1500,
    action,
    // Most views are about the map, not the welcome screen, so first-run is
    // marked as already seen unless a view explicitly wants it.
    showOnboarding = false,
  } = opts;

  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const page = await browser.newPage({
    viewport: { width: viewport[0], height: viewport[1] },
    deviceScaleFactor: 2,
  });

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  const result = { consoleErrors, pageErrors, failedRequests, webgl: null, appErrors: [] };

  try {
    if (!showOnboarding) {
      await page.addInitScript(() => {
        try {
          localStorage.setItem('terra.onboarded', '1');
        } catch {
          /* blocked site data — the overlay will simply show */
        }
      });
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Confirm the renderer is real before trusting anything we screenshot.
    result.webgl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (!gl) return { ok: false };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        ok: true,
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    });

    if (action) await action(page);

    await page.waitForFunction(() => window.__terra?.ready(), null, { timeout: 60_000 });
    await page.evaluate(() => window.__terra.idle());
    await page.waitForTimeout(settleMs);

    const app = await page.evaluate(() => ({
      errors: window.__terra.errors ?? [],
      stats: window.__terra.stats ?? null,
    }));
    result.appErrors = app.errors;
    result.stats = app.stats;

    await mkdir(dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    result.screenshot = out;
  } catch (err) {
    result.fatal = String(err);
    try {
      await mkdir(dirname(out), { recursive: true });
      await page.screenshot({ path: out });
      result.screenshot = out;
    } catch {
      /* screenshot of a broken page is best-effort */
    }
  } finally {
    await browser.close();
  }

  return result;
}
