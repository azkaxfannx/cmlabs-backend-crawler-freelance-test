import { Module } from '@nestjs/common';
import { CrawlerModule } from './crawler/crawler.module';

@Module({
  imports: [CrawlerModule],
})
export class AppModule {}
