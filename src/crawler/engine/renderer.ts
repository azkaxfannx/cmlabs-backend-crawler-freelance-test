/**
 * Rendering engine.
 *
 * Single-page render flow:
 *   1. Spin up a reusable BrowserContext
 *   2. Track every request + any service worker that registers
 *   3. Navigate → wait for network idle → auto-scroll → short settle
 *   4. Grab the rendered HTML and enrich it with <base href> so the
 *      saved file can resolve relative assets when opened locally
 *   5. Classify the page (SPA / SSR / PWA / HYBRID / STATIC)
 *   6. Take a full-page screenshot for visual proof
 *
 * We deliberately keep this layer framework-agnostic — NestJS wraps it in
 * a service but this module has zero Nest coupling, which makes it easy
 * to reuse from the CLI script.
 */

import { chromium, type Browser } from 'playwright';
import { autoScroll } from './scroller';
import { classify, collectSignals, type DetectionResult } from './detector';

export interface RenderOptions {
  url: string;
  waitExtraMs?: number;
  navigationTimeoutMs?: number;
  scroll?: boolean;
  userAgent?: string;
  locale?: string;
  viewport?: { width: number; height: number };
}

export interface RenderResult {
  url: string;
  finalUrl: string;
  title: string;
  html: string;
  rawHtml: string;
  screenshot: Buffer;
  detection: DetectionResult;
  stats: {
    requests: number;
    failedRequests: number;
    serviceWorkersSeen: number;
    durationMs: number;
  };
  fetchedAt: string;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class CrawlerEngine {
  private browser: Browser | null = null;

  async start(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }

  async stop(): Promise<void> {
    if (!this.browser) return;
    await this.browser.close();
    this.browser = null;
  }

  async render(opts: RenderOptions): Promise<RenderResult> {
    if (!this.browser) await this.start();
    const browser = this.browser!;

    const started = Date.now();

    const context = await browser.newContext({
      userAgent: opts.userAgent ?? DEFAULT_UA,
      locale: opts.locale ?? 'en-US',
      viewport: opts.viewport ?? { width: 1440, height: 900 },
      serviceWorkers: 'allow',
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });

    // Track what happens on the wire so we can report it in the metadata.
    let requests = 0;
    let failed = 0;
    let swSeen = 0;
    context.on('request', () => requests++);
    context.on('requestfailed', () => failed++);
    context.on('serviceworker', () => swSeen++);

    const page = await context.newPage();

    // Capture the raw HTML the origin responded with (before JS runs).
    // This is critical for detection: it tells us how much content was
    // server-rendered vs injected later by the client.
    //
    // We compare normalized URLs (ignoring trailing slash) because Playwright
    // reports URLs with their canonical path while callers may pass them
    // without the trailing slash.
    let rawHtml = '';
    const normalize = (u: string): string => u.replace(/\/+$/, '');
    const targetNormalized = normalize(opts.url);
    page.on('response', async (resp) => {
      try {
        if (normalize(resp.url()) !== targetNormalized) return;
        const ct = resp.headers()['content-type'] ?? '';
        if (ct.includes('text/html') && !rawHtml) {
          rawHtml = await resp.text();
        }
      } catch {
        // body may already be consumed or the response may be a redirect — ignore
      }
    });

    try {
      const response = await page.goto(opts.url, {
        waitUntil: 'domcontentloaded',
        timeout: opts.navigationTimeoutMs ?? 45_000,
      });

      // If we didn't catch the raw HTML via the response listener (some
      // sites navigate via redirects), fall back to the main response body.
      if (!rawHtml && response) {
        try {
          const ct = response.headers()['content-type'] ?? '';
          if (ct.includes('text/html')) rawHtml = await response.text();
        } catch {
          /* ignore */
        }
      }

      // Let XHR/fetch settle. networkidle can be flaky on sites that keep
      // long-lived sockets open, so we cap it and soldier on either way.
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {
        /* some sites never go idle — that's ok, we have enough already */
      });

      if (opts.scroll !== false) {
        await autoScroll(page);
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
          /* same story */
        });
      }

      // Small settle so animations / hydration get a final tick.
      await page.waitForTimeout(opts.waitExtraMs ?? 1200);

      const title = await page.title();
      const finalUrl = page.url();

      const signals = await collectSignals(page, rawHtml);
      const detection = classify(signals);

      const renderedHtml = await page.content();
      const html = injectBaseHref(renderedHtml, finalUrl);

      const screenshot = await page.screenshot({ fullPage: true, type: 'png' });

      return {
        url: opts.url,
        finalUrl,
        title,
        html,
        rawHtml,
        screenshot,
        detection,
        stats: {
          requests,
          failedRequests: failed,
          serviceWorkersSeen: swSeen,
          durationMs: Date.now() - started,
        },
        fetchedAt: new Date().toISOString(),
      };
    } finally {
      await context.close();
    }
  }
}

/**
 * Insert a <base href="..."> into <head> so that when the HTML file is
 * opened straight from disk, relative URLs (/static/..., /_next/...)
 * still resolve against the original origin instead of the file://
 * directory.
 */
function injectBaseHref(html: string, url: string): string {
  if (/<base\s/i.test(html)) return html;
  const tag = `<base href="${url}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n  ${tag}`);
  }
  // no <head> at all — unusual, but just prepend.
  return `${tag}\n${html}`;
}
