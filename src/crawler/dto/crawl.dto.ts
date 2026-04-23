import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUrl } from 'class-validator';

export class CrawlRequestDto {
  @ApiProperty({
    description: 'Absolute URL of the page to crawl. SPA, SSR, and PWA pages are all supported.',
    example: 'https://cmlabs.co',
  })
  @IsUrl({ require_protocol: true })
  url!: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Scroll to the bottom of the page to trigger lazy-loaded content before capture.',
  })
  @IsOptional()
  @IsBoolean()
  scroll?: boolean;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Also capture a full-page PNG screenshot alongside the HTML.',
  })
  @IsOptional()
  @IsBoolean()
  screenshot?: boolean;
}

export class CrawlResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'HYBRID' })
  type!: string;

  @ApiProperty({ example: 'Next.js', nullable: true })
  framework!: string | null;

  @ApiProperty({ example: 'cmlabs.co' })
  slug!: string;

  @ApiProperty({ example: 'cmlabs.co.html' })
  htmlFile!: string;

  @ApiProperty({ example: 'cmlabs.co.png' })
  screenshotFile!: string;

  @ApiProperty({
    description: 'Full metadata: detection signals, request stats, and timestamps.',
  })
  meta!: Record<string, unknown>;
}
