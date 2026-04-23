import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { CrawlerService } from './crawler.service';
import { CrawlRequestDto, CrawlResponseDto } from './dto/crawl.dto';
import { StorageService } from '../common/storage.service';

@ApiTags('crawler')
@Controller()
export class CrawlerController {
  constructor(
    private readonly crawler: CrawlerService,
    private readonly storage: StorageService,
  ) {}

  @Post('crawl')
  @ApiOperation({
    summary: 'Render and capture a page',
    description:
      'Launches a real Chromium browser, renders the target URL (handles SPA / SSR / PWA), ' +
      'saves the final HTML + a screenshot + metadata to ./results, and returns the classification.',
  })
  @ApiResponse({ status: 201, type: CrawlResponseDto })
  async crawl(@Body() dto: CrawlRequestDto): Promise<CrawlResponseDto> {
    return this.crawler.crawl(dto);
  }

  @Get('results/:filename')
  @ApiOperation({ summary: 'Download a previously saved artifact (.html, .png, or .meta.json)' })
  serveResult(@Param('filename') filename: string, @Res() res: Response): void {
    const path = this.storage.resolveResultsPath(filename);
    if (!existsSync(path)) throw new NotFoundException(`${filename} not found`);
    res.sendFile(path);
  }

  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  health(): { status: string; uptime: number } {
    return { status: 'ok', uptime: process.uptime() };
  }
}
