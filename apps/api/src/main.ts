import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // SEO/discoverability docs live at the site root, where crawlers expect them —
  // exclude them from the /api/v1 prefix. Everything else is versioned.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      'robots.txt',
      'sitemap.xml',
      'news-sitemap.xml',
      'rss.xml',
      'categories/:slug/rss.xml',
    ],
  });
  // Validate every DTO and reject unknown fields — trust nothing from the client.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
