import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('cmlabs Backend Crawler')
    .setDescription(
      'Render and capture full HTML from SPA, SSR, and PWA websites using a headless browser.',
    )
    .setVersion('1.0.0')
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, doc);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`listening on http://localhost:${port} — docs at /api/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('failed to start:', err);
  process.exit(1);
});
