import { NotFoundException } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import type { SubscriptionService } from '../monetisation/subscription.service';
import { startIntDb, TEST_DB_NAME, type IntDb } from '../test/int-db';
import { ARTICLE_MODEL, ArticleSchema, type ArticleDoc } from './article.schema';
import { ArticleService } from './article.service';

/**
 * Real-Mongo integration specs for the Article query logic the §13 list calls
 * out: the publish workflow and — the crown jewel — the invariant that a draft,
 * an archived, or a future-dated ("embargoed") article never leaks into the
 * public feed. That guarantee lives in the query, so we run it against an actual
 * MongoDB rather than a hand-mocked model that could agree with a bug.
 */
describe('ArticleService (integration, real Mongo)', () => {
  let db: IntDb;
  let service: ArticleService;

  // These specs use only non-premium articles, so the paywall never consults it.
  const noSubscriptions = {
    hasActiveSubscription: async () => false,
  } as unknown as SubscriptionService;

  beforeAll(async () => {
    db = await startIntDb([[ARTICLE_MODEL, ArticleSchema]]);
    service = new ArticleService(db.mongo, db.ctx, noSubscriptions);
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset(ARTICLE_MODEL);
  });

  const model = (): Model<ArticleDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<ArticleDoc>(ARTICLE_MODEL);

  /** Seed an article straight through the model so status/publishedAt are exact. */
  function seed(over: Partial<ArticleDoc> & { slug: string }): Promise<ArticleDoc> {
    return model().create({
      title: over.title ?? over.slug,
      body: {},
      status: 'draft',
      authorId: new Types.ObjectId(),
      ...over,
    });
  }

  it('listPublished returns ONLY the past-published article — never draft, archived, or future-dated', async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60 * 60_000);
    await seed({ slug: 'a-draft', status: 'draft' });
    await seed({ slug: 'a-archived', status: 'archived', publishedAt: past });
    await seed({ slug: 'a-future', status: 'published', publishedAt: future });
    await seed({ slug: 'a-live', status: 'published', publishedAt: past });

    const page = await service.listPublished({});

    expect(page.total).toBe(1);
    expect(page.items.map((i) => i.slug)).toEqual(['a-live']);
  });

  describe('getPublishedBySlug', () => {
    it('returns the published article and increments views by 1', async () => {
      await seed({
        slug: 'live-story',
        status: 'published',
        publishedAt: new Date(Date.now() - 1000),
        views: 0,
      });

      const view = await service.getPublishedBySlug('live-story');

      expect(view.slug).toBe('live-story');
      expect(view.views).toBe(1);
      // and the increment is persisted, not just reflected in the return value
      const fresh = await model().findOne({ slug: 'live-story' }).lean<ArticleDoc>().exec();
      expect(fresh?.views).toBe(1);
    });

    it('404s on a draft slug (an unpublished article is not publicly readable)', async () => {
      await seed({ slug: 'hidden-draft', status: 'draft' });

      await expect(service.getPublishedBySlug('hidden-draft')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('publish flips a draft to published and stamps publishedAt (<= now)', async () => {
    const draft = await seed({ slug: 'to-publish', status: 'draft' });
    expect(draft.publishedAt).toBeUndefined();

    const before = Date.now();
    const view = await service.publish(draft._id.toString());

    expect(view.status).toBe('published');
    expect(view.publishedAt).toBeDefined();
    const stampedAt = new Date(view.publishedAt!).getTime();
    expect(stampedAt).toBeGreaterThanOrEqual(before);
    expect(stampedAt).toBeLessThanOrEqual(Date.now());
  });

  it('derives distinct slugs for two articles sharing a title (x, x-2)', async () => {
    const authorId = new Types.ObjectId().toString();
    const first = await service.create({ title: 'Same Title', body: {} }, authorId);
    const second = await service.create({ title: 'Same Title', body: {} }, authorId);

    expect(first.slug).toBe('same-title');
    expect(second.slug).toBe('same-title-2');
  });
});
