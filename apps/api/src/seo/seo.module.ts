import { Module } from '@nestjs/common';
import { SiteConfigModule } from '../site-config/site-config.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

/**
 * SEO — public, tenant-scoped discoverability: sitemap, Google News sitemap, RSS,
 * and robots.txt. Owns no collections; it reads Article/Category/Edition off the
 * shared tenant connection (registered by Content/Taxonomy) and SiteConfig for the
 * brand name + language. Rendered docs are cached in Redis (~5 min). See CLAUDE.md
 * §12 (Phase 3, SEO).
 */
@Module({
  imports: [TenancyModule, SiteConfigModule],
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}
