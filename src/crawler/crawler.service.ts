import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CrawlerEngine } from './engine/renderer';
import { StorageService } from '../common/storage.service';
import type { CrawlRequestDto, CrawlResponseDto } from './dto/crawl.dto';

/**
 * Thin orchestration layer between the HTTP controller and the render
 * engine. The engine owns one Chromium process for the lifetime of the
 * module — spinning up a fresh browser per request would cost ~1s extra
 * and is unnecessary since Playwright contexts are already isolated.
 */
@Injectable()
export class CrawlerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrawlerService.name);
  private readonly engine = new CrawlerEngine();

  constructor(private readonly storage: StorageService) {}

  async onModuleInit(): Promise<void> {
    await this.engine.start();
    this.logger.log('Chromium ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.engine.stop();
  }

  async crawl(dto: CrawlRequestDto): Promise<CrawlResponseDto> {
    this.logger.log(`crawling ${dto.url}`);
    const result = await this.engine.render({
      url: dto.url,
      scroll: dto.scroll !== false,
    });

    const saved = await this.storage.save(result);

    return {
      success: true,
      type: result.detection.kind,
      framework: result.detection.framework,
      slug: saved.slug,
      htmlFile: `${saved.slug}.html`,
      screenshotFile: `${saved.slug}.png`,
      meta: {
        url: result.url,
        finalUrl: result.finalUrl,
        title: result.title,
        fetchedAt: result.fetchedAt,
        detection: result.detection,
        stats: result.stats,
      },
    };
  }
}
