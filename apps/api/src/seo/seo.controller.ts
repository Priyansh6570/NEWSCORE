import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { RequestOrigin } from './request-origin.decorator';
import { SeoService } from './seo.service';

const XML = 'application/xml; charset=utf-8';
const TEXT = 'text/plain; charset=utf-8';

/**
 * Public, tenant-scoped discoverability documents. Every route is @Public (the
 * tenant is resolved from Host, not auth) and returns raw XML/text — not JSON.
 * These live at the site root (excluded from the global /api/v1 prefix in main.ts)
 * so robots.txt and the sitemaps sit where crawlers expect them.
 */
@Controller()
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Public() @Get('sitemap.xml') @Header('Content-Type', XML)
  sitemap(@RequestOrigin() origin: string, @Query('page') page?: string) {
    const n = page ? Number(page) : undefined;
    return this.seo.sitemap(origin, Number.isFinite(n) && n! > 0 ? n : undefined);
  }

  @Public() @Get('news-sitemap.xml') @Header('Content-Type', XML)
  newsSitemap(@RequestOrigin() origin: string) {
    return this.seo.newsSitemap(origin);
  }

  @Public() @Get('rss.xml') @Header('Content-Type', XML)
  rss(@RequestOrigin() origin: string) {
    return this.seo.rss(origin);
  }

  @Public() @Get('categories/:slug/rss.xml') @Header('Content-Type', XML)
  categoryRss(@RequestOrigin() origin: string, @Param('slug') slug: string) {
    return this.seo.rss(origin, slug);
  }

  @Public() @Get('robots.txt') @Header('Content-Type', TEXT)
  robots(@RequestOrigin() origin: string) {
    return this.seo.robots(origin);
  }
}
