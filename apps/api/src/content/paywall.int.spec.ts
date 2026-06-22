import { type Model, Types } from 'mongoose';
import type { SubscriptionService } from '../monetisation/subscription.service';
import { startIntDb, TEST_DB_NAME, type IntDb } from '../test/int-db';
import { ARTICLE_MODEL, ArticleSchema, type ArticleDoc } from './article.schema';
import { ArticleService } from './article.service';

/**
 * The paywall invariant (CLAUDE.md §13): the full body of a PREMIUM article is
 * served only to an active subscriber. Neither an anonymous reader nor a
 * logged-in non-subscriber may ever receive it — they get the paywalled view
 * (metadata + excerpt, body omitted). A non-premium article is full for everyone.
 *
 * Driven against real Mongo so the single-read query (and its view increment) is
 * the production path. The subscription check is stubbed per-user so the spec
 * isolates the gate decision, not the Subscriber collection.
 */
describe('Paywall (integration, real Mongo)', () => {
  const SUBSCRIBER_ID = new Types.ObjectId().toString();
  const NON_SUBSCRIBER_ID = new Types.ObjectId().toString();

  let db: IntDb;
  let service: ArticleService;

  // Only SUBSCRIBER_ID has an active subscription.
  const subscriptions = {
    hasActiveSubscription: async (userId: string) => userId === SUBSCRIBER_ID,
  } as unknown as SubscriptionService;

  beforeAll(async () => {
    db = await startIntDb([[ARTICLE_MODEL, ArticleSchema]]);
    service = new ArticleService(db.mongo, db.ctx, subscriptions);
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset(ARTICLE_MODEL);
  });

  const model = (): Model<ArticleDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<ArticleDoc>(ARTICLE_MODEL);

  const SECRET_BODY = { blocks: [{ type: 'paragraph', text: 'members-only scoop' }] };

  function seedLive(over: Partial<ArticleDoc> & { slug: string }): Promise<ArticleDoc> {
    return model().create({
      title: over.title ?? over.slug,
      body: SECRET_BODY,
      status: 'published',
      publishedAt: new Date(Date.now() - 1000),
      authorId: new Types.ObjectId(),
      ...over,
    });
  }

  describe('a premium article', () => {
    beforeEach(async () => {
      await seedLive({ slug: 'premium-scoop', isPremium: true, excerpt: 'teaser' });
    });

    it('is PAYWALLED for an anonymous reader — no body', async () => {
      const view = await service.getPublishedBySlug('premium-scoop', undefined);
      expect(view.isPremium).toBe(true);
      expect(view.paywalled).toBe(true);
      expect(view.body).toBeNull();
      // metadata + excerpt still flow so the client can render the teaser/badge
      expect(view.excerpt).toBe('teaser');
      expect(view.title).toBe('premium-scoop');
    });

    it('is PAYWALLED for a logged-in NON-subscriber — no body', async () => {
      const view = await service.getPublishedBySlug('premium-scoop', NON_SUBSCRIBER_ID);
      expect(view.paywalled).toBe(true);
      expect(view.body).toBeNull();
    });

    it('returns the FULL body to an active subscriber', async () => {
      const view = await service.getPublishedBySlug('premium-scoop', SUBSCRIBER_ID);
      expect(view.paywalled).toBeUndefined();
      expect(view.body).toEqual(SECRET_BODY);
    });

    it('still increments views even when paywalled', async () => {
      await service.getPublishedBySlug('premium-scoop', undefined);
      const fresh = await model().findOne({ slug: 'premium-scoop' }).lean<ArticleDoc>().exec();
      expect(fresh?.views).toBe(1);
    });

    it('does not leak the premium body through the public list either', async () => {
      const page = await service.listPublished({});
      const card = page.items.find((i) => i.slug === 'premium-scoop');
      expect(card).toBeDefined();
      expect(card!.isPremium).toBe(true); // badge still exposed
      expect(card!.body).toBeNull(); // body never in the ungated feed
    });
  });

  describe('a non-premium article', () => {
    it('returns the full body to everyone — anonymous, non-subscriber, subscriber', async () => {
      await seedLive({ slug: 'free-story', isPremium: false });

      for (const reader of [undefined, NON_SUBSCRIBER_ID, SUBSCRIBER_ID]) {
        const view = await service.getPublishedBySlug('free-story', reader);
        expect(view.paywalled).toBeUndefined();
        expect(view.body).toEqual(SECRET_BODY);
      }
    });
  });
});
