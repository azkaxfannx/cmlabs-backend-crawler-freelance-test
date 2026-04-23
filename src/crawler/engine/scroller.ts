/**
 * Slowly scroll the page to the bottom so that anything wired up to
 * IntersectionObserver / "load on scroll" actually loads. We do it in
 * small steps with a short delay — a single jump to the bottom is
 * usually missed by lazy observers.
 */

import type { Page } from 'playwright';

export async function autoScroll(page: Page, stepPx = 600, delayMs = 120): Promise<void> {
  await page.evaluate(
    async ({ stepPx, delayMs }) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let lastHeight = -1;
      // scroll until the document height stops growing (or we hit a hard cap)
      for (let i = 0; i < 200; i++) {
        const doc = document.documentElement;
        window.scrollBy(0, stepPx);
        await sleep(delayMs);
        if (doc.scrollTop + window.innerHeight >= doc.scrollHeight - 2) {
          if (doc.scrollHeight === lastHeight) break;
          lastHeight = doc.scrollHeight;
          await sleep(delayMs * 2);
        }
      }
      window.scrollTo(0, 0);
    },
    { stepPx, delayMs },
  );
}
