/**
 * Disk persistence for crawl outputs. Everything lands under ./results
 * in a predictable, slug-based layout so reviewers can diff and inspect.
 *
 *   results/
 *     cmlabs.co.html
 *     cmlabs.co.meta.json
 *     cmlabs.co.png
 */

import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RenderResult } from '../crawler/engine/renderer';

export interface SavedArtifact {
  slug: string;
  htmlPath: string;
  metaPath: string;
  screenshotPath: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root = resolve(process.cwd(), 'results');

  async save(result: RenderResult): Promise<SavedArtifact> {
    await fs.mkdir(this.root, { recursive: true });

    const slug = slugifyUrl(result.finalUrl || result.url);
    const htmlPath = join(this.root, `${slug}.html`);
    const metaPath = join(this.root, `${slug}.meta.json`);
    const screenshotPath = join(this.root, `${slug}.png`);

    const meta = {
      url: result.url,
      finalUrl: result.finalUrl,
      title: result.title,
      fetchedAt: result.fetchedAt,
      detection: {
        kind: result.detection.kind,
        framework: result.detection.framework,
        reasoning: result.detection.reasoning,
        signals: result.detection.signals,
      },
      stats: result.stats,
      artifacts: {
        html: `${slug}.html`,
        screenshot: `${slug}.png`,
      },
    };

    await Promise.all([
      fs.writeFile(htmlPath, result.html, 'utf8'),
      fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8'),
      fs.writeFile(screenshotPath, result.screenshot),
    ]);

    this.logger.log(`saved ${slug} (${result.detection.kind}) → ${htmlPath}`);

    return { slug, htmlPath, metaPath, screenshotPath };
  }

  resolveResultsPath(filename: string): string {
    // Prevent path traversal — only allow plain filenames under ./results.
    const safe = filename.replace(/[\\/]+/g, '').replace(/\.\./g, '');
    return join(this.root, safe);
  }
}

/**
 * Turn a URL into a flat, filesystem-safe slug.
 *   https://cmlabs.co/en-id  →  cmlabs.co_en-id
 *   https://web.dev/         →  web.dev
 */
export function slugifyUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.replace(/[^a-zA-Z0-9.-]+/g, '_').slice(0, 80);
  }
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '_');
  const slug = path ? `${host}_${path}` : host;
  return slug.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
}
