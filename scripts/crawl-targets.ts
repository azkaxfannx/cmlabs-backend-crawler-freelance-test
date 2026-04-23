/**
 * CLI entry point for the assignment requirement:
 *   "Crawl https://cmlabs.co, https://sequence.day, and 1 free website"
 *
 * Run:   npm run crawl:targets
 *
 * This bypasses the HTTP layer and drives the engine + storage directly
 * so the whole thing fits in one predictable batch. Output lands in
 * ./results/.
 */

import { CrawlerEngine } from '../src/crawler/engine/renderer';
import { slugifyUrl } from '../src/common/storage.service';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

const TARGETS = [
  // Required by the task
  'https://cmlabs.co',
  'https://sequence.day',
  // Free pick — web.dev is a real PWA (service worker + manifest, shipped by
  // Google's Chrome team). It proves the pipeline handles PWAs, not just
  // "heavy JS" sites.
  'https://web.dev',
];

async function main(): Promise<void> {
  const outDir = resolve(process.cwd(), 'results');
  await fs.mkdir(outDir, { recursive: true });

  const engine = new CrawlerEngine();
  await engine.start();

  const summary: Array<Record<string, unknown>> = [];

  try {
    for (const [index, url] of TARGETS.entries()) {
      const label = `[${index + 1}/${TARGETS.length}] ${url}`;

      console.log(`\n${label} — rendering…`);

      try {
        const result = await engine.render({ url });
        // Use the input URL for the filename so the assignment targets map
        // cleanly to cmlabs.co.html / sequence.day.html / web.dev.html even
        // if the origin redirects (cmlabs.co → cmlabs.co/en-id).
        const slug = slugifyUrl(url);

        const htmlPath = join(outDir, `${slug}.html`);
        const metaPath = join(outDir, `${slug}.meta.json`);
        const shotPath = join(outDir, `${slug}.png`);

        const meta = {
          url: result.url,
          finalUrl: result.finalUrl,
          title: result.title,
          fetchedAt: result.fetchedAt,
          detection: result.detection,
          stats: result.stats,
          artifacts: {
            html: `${slug}.html`,
            screenshot: `${slug}.png`,
          },
        };

        await Promise.all([
          fs.writeFile(htmlPath, result.html, 'utf8'),
          fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8'),
          fs.writeFile(shotPath, result.screenshot),
        ]);

        console.log(
          `${label} — ok · ${result.detection.kind}` +
            (result.detection.framework ? ` (${result.detection.framework})` : '') +
            ` · ${result.stats.durationMs}ms · ${Math.round(result.html.length / 1024)} KB`,
        );

        summary.push({
          url,
          slug,
          type: result.detection.kind,
          framework: result.detection.framework,
          title: result.title,
          durationMs: result.stats.durationMs,
          htmlBytes: result.html.length,
        });
      } catch (err) {
        console.error(`${label} — FAILED:`, (err as Error).message);
        summary.push({ url, error: (err as Error).message });
      }
    }

    await fs.writeFile(
      join(outDir, 'summary.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), targets: summary }, null, 2),
      'utf8',
    );

    console.log('\nDone. See ./results for the output.\n');
  } finally {
    await engine.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
