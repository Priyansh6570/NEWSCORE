import { NotFoundException } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { ARTICLE_MODEL, ArticleSchema, type ArticleDoc } from '../content/article.schema';
import type { RedisService } from '../redis/redis.service';
import type { SiteConfigService } from '../site-config/site-config.service';
import { CATEGORY_MODEL, CategorySchema, type CategoryDoc } from '../taxonomy/category.schema';
import { EDITION_MODEL, EditionSchema } from '../taxonomy/edition.schema';
import { startIntDb, TEST_DB_NAME, type IntDb } from '../test/int-db';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { SeoService } from './seo.service';

/**
 * Real-Mongo integration specs for the SEO crawler-facing invariant: a draft, a
 * future-dated ("embargoed"), or an archived article must NEVER appear in the
 * sitemap, the news sitemap, or RSS — the same visibility rule the public article
 * feed enforces, now for crawlers. Plus a check that the feeds are well-formed and
 * scoped correctly. Run against an actual MongoDB so the query semantics are real.
 */
describe('SeoService (integration, real Mongo)', () => {
  let db: IntDb;
  let seo: SeoService;
  const ORIGIN = 'https://demo.example.com';

  // In-memory Redis (only get/set used) so caching is exercised without a server.
  const cache = new Map<string, string>();
  const redis = {
    get: async (k: string) => cache.get(k) ?? null,
    set: async (k: string, v: string) => {
      cache.set(k, v);
      return 'OK';
    },
  } as unknown as RedisService;

  // Minimal SiteConfig: only brand name + default language are read.
  const siteConfig = {
    getPublicView: async () => ({
      brand: { name: 'Demo Paper' },
      locale: { default: 'en', available: ['en'] },
    }),
  } as unknown as SiteConfigService;

  beforeAll(async () => {
    db = await startIntDb([
      [ARTICLE_MODEL, ArticleSchema],
      [CATEGORY_MODEL, CategorySchema],
      [EDITION_MODEL, EditionSchema],
    ]);
    const ctx = { dbName: TEST_DB_NAME, tenantId: 'tenant-seo' } as unknown as TenantContextService;
    seo = new SeoService(db.mongo, ctx, redis, siteConfig);
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    cache.clear();
    await db.reset(ARTICLE_MODEL);
    await db.reset(CATEGORY_MODEL);
    await db.reset(EDITION_MODEL);
  });

  const articleModel = (): Model<ArticleDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<ArticleDoc>(ARTICLE_MODEL);
  const categoryModel = (): Model<CategoryDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<CategoryDoc>(CATEGORY_MODEL);

  function seedArticle(over: Partial<ArticleDoc> & { slug: string; title: string }): Promise<ArticleDoc> {
    return articleModel().create({
      body: {},
      status: 'draft',
      authorId: new Types.ObjectId(),
      ...over,
    });
  }

  const past = (): Date => new Date(Date.now() - 60_000);
  const future = (): Date => new Date(Date.now() + 60 * 60_000);

  /** Seed one of each visibility state; only `live-1`/`live-2` should ever surface. */
  async function seedMixed(categoryId?: Types.ObjectId): Promise<void> {
    await seedArticle({ slug: 'a-draft', title: 'Draft Story', status: 'draft' });
    await seedArticle({ slug: 'a-future', title: 'Embargoed Story', status: 'published', publishedAt: future() });
    await seedArticle({ slug: 'a-archived', title: 'Archived Story', status: 'archived', publishedAt: past() });
    await seedArticle({ slug: 'live-1', title: 'Live One', status: 'published', publishedAt: past(), categoryId });
    await seedArticle({ slug: 'live-2', title: 'Live Two', status: 'published', publishedAt: past(), categoryId });
  }

  // ── Invariant: nothing unpublished leaks to a crawler ─────────────────────

  it('sitemap includes only live published article URLs — never draft/future/archived', async () => {
    await seedMixed();
    const xml = await seo.sitemap(ORIGIN);

    expect(xml).toContain(`${ORIGIN}/article/live-1`);
    expect(xml).toContain(`${ORIGIN}/article/live-2`);
    expect(xml).not.toContain('a-draft');
    expect(xml).not.toContain('a-future');
    expect(xml).not.toContain('a-archived');
    // well-formed urlset with exactly the two live URLs
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset');
    expect((xml.match(/<loc>/g) ?? []).length).toBe(2);
  });

  it('sitemap lists category and edition landing pages alongside articles', async () => {
    await categoryModel().create({ name: 'Politics', slug: 'politics', order: 0 });
    await db.mongo
      .tenant(TEST_DB_NAME)
      .model(EDITION_MODEL)
      .create({ name: 'North', slug: 'north' });
    await seedArticle({ slug: 'live-1', title: 'Live', status: 'published', publishedAt: past() });

    const xml = await seo.sitemap(ORIGIN);
    expect(xml).toContain(`${ORIGIN}/category/politics`);
    expect(xml).toContain(`${ORIGIN}/edition/north`);
  });

  it('news sitemap carries the brand name and excludes a >48h-old published article', async () => {
    const old = new Date(Date.now() - 72 * 60 * 60_000); // 3 days ago
    await seedArticle({ slug: 'recent', title: 'Breaking Today', status: 'published', publishedAt: past() });
    await seedArticle({ slug: 'old-news', title: 'Last Week', status: 'published', publishedAt: old });
    await seedArticle({ slug: 'a-draft', title: 'Draft', status: 'draft' });

    const xml = await seo.newsSitemap(ORIGIN);
    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(xml).toContain('<news:name>Demo Paper</news:name>');
    expect(xml).toContain('<news:language>en</news:language>');
    expect(xml).toContain(`${ORIGIN}/article/recent`);
    expect(xml).not.toContain('old-news');
    expect(xml).not.toContain('a-draft');
  });

  it('RSS is well-formed 2.0 with only live items', async () => {
    await seedMixed();
    const xml = await seo.rss(ORIGIN);

    expect(xml).toContain('<rss');
    expect(xml).toContain('version="2.0"');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('<title>Demo Paper</title>');
    expect((xml.match(/<item>/g) ?? []).length).toBe(2); // live-1, live-2 only
    expect(xml).toContain(`${ORIGIN}/article/live-1`);
    expect(xml).not.toContain('a-draft');
    expect(xml).not.toContain('a-future');
  });

  it('category RSS is scoped to that category (404 on an unknown slug)', async () => {
    const cat = await categoryModel().create({ name: 'Sports', slug: 'sports', order: 0 });
    await seedMixed(cat._id); // live-1/live-2 are in 'sports'
    await seedArticle({ slug: 'other-live', title: 'Other', status: 'published', publishedAt: past() }); // no category

    const xml = await seo.rss(ORIGIN, 'sports');
    expect(xml).toContain('<title>Demo Paper — Sports</title>');
    expect((xml.match(/<item>/g) ?? []).length).toBe(2);
    expect(xml).not.toContain('other-live');

    await expect(seo.rss(ORIGIN, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('robots.txt allows crawling and points its Sitemap line at this origin', async () => {
    const txt = await seo.robots(ORIGIN);
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});
