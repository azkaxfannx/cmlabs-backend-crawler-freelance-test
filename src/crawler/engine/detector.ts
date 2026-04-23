/**
 * Page type inference.
 *
 * We treat every page through the same rendering pipeline (real browser),
 * but knowing what kind of page we just rendered is useful metadata for
 * the reviewer and for any downstream consumer. The signals below are
 * collected inside the page context right before we grab the final HTML.
 */

import type { Page } from 'playwright';

export type PageKind = 'SPA' | 'SSR' | 'PWA' | 'HYBRID' | 'STATIC';

export interface DetectionSignals {
  hasServiceWorker: boolean;
  hasManifest: boolean;
  framework: string | null;
  rootLooksEmptyBeforeJs: boolean;
  hasNextData: boolean;
  hasNuxtData: boolean;
  hasSvelteKit: boolean;
  bodyTextLengthRaw: number;
  bodyTextLengthRendered: number;
}

export interface DetectionResult {
  kind: PageKind;
  framework: string | null;
  signals: DetectionSignals;
  reasoning: string[];
}

/**
 * Collect signals from the live page. Must be called AFTER the page has
 * finished rendering (networkidle + scroll). `rawHtml` is the HTML as
 * served by the origin BEFORE the browser executed scripts — we pass it
 * in so we can measure the SSR payload.
 */
export async function collectSignals(page: Page, rawHtml: string): Promise<DetectionSignals> {
  // Quick parse on the raw HTML to know how much content the origin shipped.
  const rawBodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const rawBodyText = rawBodyMatch ? stripTags(rawBodyMatch[1]) : '';

  const inPage = await page.evaluate(() => {
    const get = (sel: string) => document.querySelector(sel);

    const manifest = !!get('link[rel="manifest"]');
    const nextDataLegacy = !!get('script#__NEXT_DATA__');
    // Next.js App Router (13+) streams RSC payloads into a global __next_f array
    // and serves assets under /_next/. Either signal is reliable.
    const nextAppRouter =
      Array.isArray((window as unknown as { __next_f?: unknown[] }).__next_f) ||
      !!document.querySelector('script[src*="/_next/"]') ||
      !!document.querySelector('link[href*="/_next/"]');
    const nextData = nextDataLegacy || nextAppRouter;
    const nuxt = !!get('#__nuxt') || !!get('#__NUXT__');
    const sveltekit = !!document.querySelector('[data-sveltekit-preload-data]');

    // Framework guess via meta generator + well-known globals.
    let framework: string | null = null;
    const gen = (get('meta[name="generator"]') as HTMLMetaElement | null)?.content || '';
    if (gen) framework = gen;
    if (nextData) framework = 'Next.js';
    else if (nuxt) framework = 'Nuxt';
    else if (sveltekit) framework = 'SvelteKit';
    else if ((window as unknown as { Vue?: unknown }).Vue) framework = framework || 'Vue';
    else if (document.querySelector('[data-reactroot], [data-react-helmet]'))
      framework = framework || 'React';

    const bodyText = document.body ? document.body.innerText.trim() : '';

    return {
      hasManifest: manifest,
      hasNextData: nextData,
      hasNuxtData: nuxt,
      hasSvelteKit: sveltekit,
      framework,
      bodyTextLengthRendered: bodyText.length,
    };
  });

  // Service worker registration is read from the browser context, not the page.
  const swRegistered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    } catch {
      return false;
    }
  });

  return {
    hasServiceWorker: swRegistered,
    hasManifest: inPage.hasManifest,
    framework: inPage.framework,
    rootLooksEmptyBeforeJs: rawBodyText.length < 400,
    hasNextData: inPage.hasNextData,
    hasNuxtData: inPage.hasNuxtData,
    hasSvelteKit: inPage.hasSvelteKit,
    bodyTextLengthRaw: rawBodyText.length,
    bodyTextLengthRendered: inPage.bodyTextLengthRendered,
  };
}

/**
 * Classify based on the signals. Rules, in order:
 *
 *   - SW registered + manifest        → PWA
 *   - raw body nearly empty + framework markers → SPA
 *   - raw body already rich + framework markers → HYBRID (SSR + client hydration, Next/Nuxt/etc.)
 *   - raw body rich, no framework markers        → SSR (classic server-rendered)
 *   - nothing interesting                        → STATIC
 */
export function classify(signals: DetectionSignals): DetectionResult {
  const reasoning: string[] = [];
  const hasFrameworkMarkers = signals.hasNextData || signals.hasNuxtData || signals.hasSvelteKit;

  let kind: PageKind;

  if (signals.hasServiceWorker && signals.hasManifest) {
    kind = 'PWA';
    reasoning.push('service worker registered and web app manifest present');
  } else if (signals.rootLooksEmptyBeforeJs && signals.bodyTextLengthRendered > 400) {
    kind = 'SPA';
    reasoning.push(
      `raw HTML body is nearly empty (${signals.bodyTextLengthRaw} chars) but rendered body has ${signals.bodyTextLengthRendered} chars — content arrived via JS`,
    );
  } else if (hasFrameworkMarkers && signals.bodyTextLengthRaw > 400) {
    kind = 'HYBRID';
    reasoning.push(
      `framework markers present (${signals.framework ?? 'unknown'}) and origin already shipped ${signals.bodyTextLengthRaw} chars — SSR + client hydration`,
    );
  } else if (signals.bodyTextLengthRaw > 400) {
    kind = 'SSR';
    reasoning.push(
      `origin shipped ${signals.bodyTextLengthRaw} chars of body text, no SPA markers`,
    );
  } else {
    kind = 'STATIC';
    reasoning.push('no strong SPA / SSR / PWA signals detected');
  }

  if (signals.hasManifest && kind !== 'PWA') {
    reasoning.push('manifest is present but no service worker was registered during the visit');
  }

  return {
    kind,
    framework: signals.framework,
    signals,
    reasoning,
  };
}

function stripTags(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
