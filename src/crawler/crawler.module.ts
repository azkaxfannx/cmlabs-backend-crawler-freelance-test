import { Module } from '@nestjs/common';
import { CrawlerController } from './crawler.controller';
import { CrawlerService } from './crawler.service';
import { StorageService } from '../common/storage.service';

@Module({
  controllers: [CrawlerController],
  providers: [CrawlerService, StorageService],
  exports: [CrawlerService, StorageService],
})
export class CrawlerModule {}
