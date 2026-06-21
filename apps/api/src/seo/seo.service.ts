import { Injectable, NotFoundException } from '@nestjs/common';
import { Feed } from 'feed';
import { type FilterQuery, type Model, Types } from 'mongoose';
import { ARTICLE_MODEL, type ArticleDoc } from '../content/article.schema';
import { MongoService } from '../database/mongo.service';
import { RedisService } from '../redis/redis.service';
import { SiteConfigService } from '../site-config/site-config.service';
import { CATEGORY_MODEL, type CategoryDoc } from '../taxonomy/category.schema';
import { EDITION_MODEL, type EditionDoc } from '../taxonomy/edition.schema';
import { TenantContextService } from '../tenancy/tenant-context.service';

/** Rendered SEO docs are cached per tenant+origin for this long (crawler-facing). */
const CACHE_TTL_SECONDS = 300;
/**
 * Articles per sitemap file. The protocol cap is 50k URLs/file; we use 45k so the
 * category/edition landing URLs that ride on the single sitemap (or page 1 of the
 * index) have headroom and the file can never exceed the cap.
 */
const SITEMAP_PAGE_SIZE = 45_000;
/** RSS carries the latest N published articles. */
const RSS_LIMIT = 30;
/** Google News: only articles from the last 48h, max 1000. */
const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;
const NEWS_LIMIT = 1000;

/** A lean article projection — only what the feeds/sitemaps need. */
type SeoArticle = Pick<
  ArticleDoc,
  'slug' | 'title' | 'excerpt' | 'publishedAt' | 'updatedAt' | 'categoryId'
>;

@Injectable()
export class SeoService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
    private readonly redis: RedisService,
    private readonly siteConfig: SiteConfigService,
  ) {}

  // ── Models on the active tenant's connection (registered by Content/Taxonomy) ──
  private articleModel(): Model<ArticleDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<ArticleDoc>(ARTICLE_MODEL);
  }
  private categoryModel(): Model<CategoryDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<CategoryDoc>(CATEGORY_MODEL);
  }
  private editionModel(): Model<EditionDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<EditionDoc>(EDITION_MODEL);
  }

  /**
   * THE crawler-facing visibility rule: only published articles whose publishedAt
   * has already passed. Identical to the public article feed — a draft, a future-
   * dated ("embargoed"), or an archived article must never reach a crawler.
   */
  private liveFilter(): FilterQuery<ArticleDoc> {
    return { status: 'published', publishedAt: { $lte: new Date() } };
  }

  // ── Public documents (each cached per tenant+origin) ──────────────────────

  /**
   * Sitemap. One <urlset> of published article URLs plus category/edition pages
   * while under the 50k cap; above it, a <sitemapindex> pointing at paginated
   * sub-sitemaps (`/sitemap.xml?page=N`). `page` requests one such slice.
   */
  async sitemap(origin: string, page?: number): Promise<string> {
    return this.cached(`sitemap:${page ?? 'root'}`, origin, async () => {
      const live = this.liveFilter();
      const total = await this.articleModel().countDocuments(live).exec();

      // Over the cap and no specific page requested → emit the index.
      if (page === undefined && total > SITEMAP_PAGE_SIZE) {
        const pages = Math.ceil(total / SITEMAP_PAGE_SIZE);
        return renderSitemapIndex(origin, pages);
      }

      const p = page ?? 1;
      const articles = await this.articleModel()
        .find(live)
        .select('slug updatedAt publishedAt')
        .sort({ publishedAt: -1 })
        .skip((p - 1) * SITEMAP_PAGE_SIZE)
        .limit(SITEMAP_PAGE_SIZE)
        .lean<SeoArticle[]>()
        .exec();

      const urls: SitemapUrl[] = articles.map((a) => ({
        loc: articleUrl(origin, a.slug),
        lastmod: (a.updatedAt ?? a.publishedAt)?.toISOString(),
      }));

      // Category/edition landing pages ride on the single sitemap or page 1.
      if (page === undefined || p === 1) {
        const [cats, eds] = await Promise.all([
          this.categoryModel().find().select('slug').lean<Pick<CategoryDoc, 'slug'>[]>().exec(),
          this.editionModel().find().select('slug').lean<Pick<EditionDoc, 'slug'>[]>().exec(),
        ]);
        for (const c of cats) urls.push({ loc: categoryUrl(origin, c.slug) });
        for (const e of eds) urls.push({ loc: editionUrl(origin, e.slug) });
      }

      return renderUrlset(urls);
    });
  }

  /** Google News sitemap — articles published in the last 48h (news: namespace). */
  async newsSitemap(origin: string): Promise<string> {
    return this.cached('news', origin, async () => {
      const since = new Date(Date.now() - NEWS_WINDOW_MS);
      const articles = await this.articleModel()
        .find({ status: 'published', publishedAt: { $gte: since, $lte: new Date() } })
        .select('slug title publishedAt')
        .sort({ publishedAt: -1 })
        .limit(NEWS_LIMIT)
        .lean<SeoArticle[]>()
        .exec();
      const { name, language } = await this.publication();
      return renderNewsSitemap(origin, articles, name, language);
    });
  }

  /**
   * RSS 2.0 of the latest published articles. With a category slug, scoped to that
   * category (404 if the slug is unknown). Built with the `feed` lib for correct
   * escaping, RFC-822 dates, and guids.
   */
  async rss(origin: string, categorySlug?: string): Promise<string> {
    const name = categorySlug ? `rss:cat:${categorySlug}` : 'rss';
    return this.cached(name, origin, async () => {
      const { name: brand, language } = await this.publication();
      const filter = this.liveFilter();

      let feedTitle = brand;
      let siteLink = origin;
      let feedLink = `${origin}/rss.xml`;
      if (categorySlug) {
        const cat = await this.categoryModel()
          .findOne({ slug: categorySlug })
          .lean<CategoryDoc>()
          .exec();
        if (!cat) throw new NotFoundException('Category not found');
        filter.categoryId = cat._id;
        feedTitle = `${brand} — ${cat.name}`;
        siteLink = categoryUrl(origin, categorySlug);
        feedLink = `${origin}/categories/${categorySlug}/rss.xml`;
      }

      const articles = await this.articleModel()
        .find(filter)
        .select('slug title excerpt publishedAt updatedAt')
        .sort({ publishedAt: -1 })
        .limit(RSS_LIMIT)
        .lean<SeoArticle[]>()
        .exec();

      const feed = new Feed({
        title: feedTitle,
        description: brand,
        id: siteLink,
        link: siteLink,
        language,
        copyright: `© ${new Date().getFullYear()} ${brand}`,
        generator: brand,
        updated: articles[0]?.publishedAt ?? new Date(),
        feedLinks: { rss: feedLink },
      });

      for (const a of articles) {
        const url = articleUrl(origin, a.slug);
        feed.addItem({
          title: a.title,
          id: url,
          link: url,
          description: a.excerpt ?? '',
          date: a.publishedAt ?? a.updatedAt ?? new Date(),
        });
      }
      return feed.rss2();
    });
  }

  /** robots.txt — allow crawling and advertise this tenant's sitemaps. */
  async robots(origin: string): Promise<string> {
    return this.cached('robots', origin, () =>
      Promise.resolve(
        [
          'User-agent: *',
          'Allow: /',
          `Sitemap: ${origin}/sitemap.xml`,
          `Sitemap: ${origin}/news-sitemap.xml`,
          '',
        ].join('\n'),
      ),
    );
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Brand name + default language from the (cached) SiteConfig public view. */
  private async publication(): Promise<{ name: string; language: string }> {
    const cfg = await this.siteConfig.getPublicView();
    return { name: cfg.brand.name, language: cfg.locale?.default ?? 'en' };
  }

  /** Render-or-serve from a tenant+origin-namespaced Redis key (~5 min TTL). */
  private async cached(name: string, origin: string, build: () => Promise<string>): Promise<string> {
    const key = `tenant:${this.ctx.tenantId}:seo:${name}:${origin}`;
    const hit = await this.redis.get(key);
    if (hit !== null && hit !== undefined) return hit;
    const doc = await build();
    await this.redis.set(key, doc, 'EX', CACHE_TTL_SECONDS);
    return doc;
  }
}

// ── URL conventions (the website consumes these paths) ──────────────────────
const articleUrl = (origin: string, slug: string): string => `${origin}/article/${slug}`;
const categoryUrl = (origin: string, slug: string): string => `${origin}/category/${slug}`;
const editionUrl = (origin: string, slug: string): string => `${origin}/edition/${slug}`;

interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

/** Escape the five XML predefined entities — never interpolate raw text into XML. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderUrlset(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => {
      const lastmod = u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '';
      return `  <url><loc>${xmlEscape(u.loc)}</loc>${lastmod}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

function renderSitemapIndex(origin: string, pages: number): string {
  const now = new Date().toISOString();
  const body = Array.from({ length: pages }, (_, i) => {
    const loc = `${origin}/sitemap.xml?page=${i + 1}`;
    return `  <sitemap><loc>${xmlEscape(loc)}</loc><lastmod>${now}</lastmod></sitemap>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>`;
}

function renderNewsSitemap(
  origin: string,
  articles: SeoArticle[],
  publicationName: string,
  language: string,
): string {
  const pubName = xmlEscape(publicationName);
  const lang = xmlEscape(language);
  const body = articles
    .map((a) => {
      const date = (a.publishedAt ?? new Date()).toISOString();
      return `  <url>
    <loc>${xmlEscape(articleUrl(origin, a.slug))}</loc>
    <news:news>
      <news:publication>
        <news:name>${pubName}</news:name>
        <news:language>${lang}</news:language>
      </news:publication>
      <news:publication_date>${date}</news:publication_date>
      <news:title>${xmlEscape(a.title)}</news:title>
    </news:news>
  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${body}
</urlset>`;
}
