import { type Connection, Types } from 'mongoose';
import { ARTICLE_MODEL, ArticleSchema, type ArticleDoc } from '../content/article.schema';
import { COMMENT_MODEL, CommentSchema } from '../engagement/comment.schema';
import { PLAN_MODEL, PlanSchema } from '../monetisation/plan.schema';
import { SUBSCRIBER_MODEL, SubscriberSchema } from '../monetisation/subscriber.schema';
import { CATEGORY_MODEL, CategorySchema } from '../taxonomy/category.schema';
import { startIntDb, TEST_DB_NAME, type IntDb } from '../test/int-db';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { AnalyticsService } from './analytics.service';

/**
 * Real-Mongo integration specs for the analytics aggregations. Sharpest invariant
 * first — TENANT ISOLATION: two tenant DBs with different fixtures, and each
 * tenant's pipelines count ONLY its own documents (CLAUDE.md §5). Plus: summary
 * matches the fixtures, top-articles is views-ordered and body-free (no premium
 * leak), and timeseries buckets by day.
 */
describe('Analytics (integration, real Mongo)', () => {
  const A = TEST_DB_NAME; // tenant A
  const B = 'tenant_test_b'; // tenant B — a different DB on the same cluster
  const DAY = 24 * 60 * 60 * 1000;
  const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY);

  let db: IntDb;
  let analyticsA: AnalyticsService;
  let analyticsB: AnalyticsService;

  const conn = (dbName: string): Connection => db.mongo.tenant(dbName);

  async function seedArticle(
    dbName: string,
    over: Partial<ArticleDoc> & { slug: string },
  ): Promise<ArticleDoc> {
    return conn(dbName).model<ArticleDoc>(ARTICLE_MODEL).create({
      title: over.title ?? over.slug,
      body: { secret: 'do-not-leak' },
      status: 'published',
      authorId: new Types.ObjectId(),
      views: 0,
      likeCount: 0,
      ...over,
    });
  }
  const addComment = (dbName: string, status: string): Promise<unknown> =>
    conn(dbName).model(COMMENT_MODEL).create({
      articleId: new Types.ObjectId(),
      authorId: new Types.ObjectId(),
      authorName: 'R',
      body: 'hi',
      status,
    });

  beforeAll(async () => {
    db = await startIntDb([
      [ARTICLE_MODEL, ArticleSchema],
      [COMMENT_MODEL, CommentSchema],
      [SUBSCRIBER_MODEL, SubscriberSchema],
      [PLAN_MODEL, PlanSchema],
      [CATEGORY_MODEL, CategorySchema],
    ]);
    analyticsA = new AnalyticsService(db.mongo, db.ctx);
    analyticsB = new AnalyticsService(db.mongo, { dbName: B } as unknown as TenantContextService);

    // ── Tenant A ──────────────────────────────────────────────────────────
    const politics = await conn(A).model(CATEGORY_MODEL).create({ name: 'Politics', slug: 'politics' });
    const tech = await conn(A).model(CATEGORY_MODEL).create({ name: 'Tech', slug: 'tech' });
    await seedArticle(A, { slug: 'a-p1', views: 100, likeCount: 5, categoryId: politics._id, publishedAt: daysAgo(3) });
    await seedArticle(A, { slug: 'a-p2', views: 50, likeCount: 2, categoryId: politics._id, isPremium: true, publishedAt: daysAgo(3) });
    await seedArticle(A, { slug: 'a-t1', views: 10, likeCount: 1, categoryId: tech._id, publishedAt: daysAgo(1) });
    await seedArticle(A, { slug: 'a-draft', status: 'draft', views: 999 }); // excluded everywhere
    await addComment(A, 'approved');
    await addComment(A, 'approved');
    await addComment(A, 'pending');
    const plan = await conn(A).model(PLAN_MODEL).create({ name: 'Monthly', amount: 49900, currency: 'INR', interval: 'month', isActive: true });
    await conn(A).model(SUBSCRIBER_MODEL).create({ userId: new Types.ObjectId(), planId: plan._id, status: 'active', razorpayOrderId: 'o_A1', currentPeriodEnd: new Date(Date.now() + DAY) });
    // active status but already lapsed → must NOT count as an active subscriber
    await conn(A).model(SUBSCRIBER_MODEL).create({ userId: new Types.ObjectId(), planId: plan._id, status: 'active', razorpayOrderId: 'o_A2', currentPeriodEnd: daysAgo(1) });

    // ── Tenant B (deliberately different) ─────────────────────────────────
    const cricket = await conn(B).model(CATEGORY_MODEL).create({ name: 'Cricket', slug: 'cricket' });
    await seedArticle(B, { slug: 'b-1', views: 999, categoryId: cricket._id, publishedAt: daysAgo(2) });
    await addComment(B, 'approved');
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  // ── Invariant 1: TENANT ISOLATION ───────────────────────────────────────────

  it('summary counts ONLY the active tenant’s documents', async () => {
    const a = await analyticsA.summary();
    const b = await analyticsB.summary();

    expect(a.publishedArticles).toBe(3);
    expect(a.totalViews).toBe(160); // 100 + 50 + 10 (draft's 999 excluded)
    expect(a.activeSubscribers).toBe(1);
    expect(a.comments.total).toBe(3);

    // B sees a wholly different world — never A's docs.
    expect(b.publishedArticles).toBe(1);
    expect(b.totalViews).toBe(999);
    expect(b.activeSubscribers).toBe(0);
    expect(b.comments.total).toBe(1);
  });

  it('by-category counts ONLY the active tenant’s categories', async () => {
    const a = await analyticsA.byCategory();
    const b = await analyticsB.byCategory();

    expect(a.map((c) => c.name)).toEqual(['Politics', 'Tech']); // desc by views
    expect(a.find((c) => c.name === 'Politics')).toMatchObject({ articles: 2, views: 150 });
    // B's only category is Cricket — and A's categories never appear here.
    expect(b.map((c) => c.name)).toEqual(['Cricket']);
    expect(b[0]).toMatchObject({ articles: 1, views: 999 });
  });

  // ── Invariant 2: summary matches fixtures (comment enum breakdown) ───────────

  it('summary breaks comments down by the real status enum', async () => {
    const a = await analyticsA.summary();
    expect(a.comments).toEqual({ pending: 1, approved: 2, rejected: 0, total: 3 });
    expect(a.totalLikes).toBe(8); // 5 + 2 + 1
  });

  // ── Invariant 3: top-articles ordered by views AND body-free ─────────────────

  it('top-articles is ordered by views and NEVER returns a body (incl. premium)', async () => {
    const top = await analyticsA.topArticles({});
    expect(top.map((t) => t.slug)).toEqual(['a-p1', 'a-p2', 'a-t1']); // 100, 50, 10
    for (const card of top) expect(card.body).toBeNull();
    // the premium article is present as a card but body-free
    expect(top.find((t) => t.slug === 'a-p2')?.isPremium).toBe(true);
  });

  it('top-articles honours the limit cap', async () => {
    const top = await analyticsA.topArticles({ limit: 2 });
    expect(top).toHaveLength(2);
    expect(top.map((t) => t.slug)).toEqual(['a-p1', 'a-p2']);
  });

  // ── subscribers-by-plan: paise GROSS value, lapsed excluded ──────────────────

  it('subscribers-by-plan reports paise gross value and excludes the lapsed subscriber', async () => {
    const a = await analyticsA.subscribersByPlan();
    expect(a.plans).toHaveLength(1);
    expect(a.plans[0]).toMatchObject({
      name: 'Monthly',
      amount: 49900, // paise, unchanged
      activeSubscribers: 1, // the lapsed (currentPeriodEnd in the past) one is not counted
      grossValuePaise: 49900, // amount * active, in paise
    });
    expect(a.totalActiveSubscribers).toBe(1);
    expect(a.totalGrossValuePaise).toBe(49900);

    // Tenant B has no plans/subscribers — and never sees A's.
    const b = await analyticsB.subscribersByPlan();
    expect(b.plans).toEqual([]);
    expect(b.totalActiveSubscribers).toBe(0);
  });

  // ── Invariant 4: timeseries buckets correctly ────────────────────────────────

  it('timeseries buckets published articles by day', async () => {
    const ts = await analyticsA.timeseries({ metric: 'articles', period: 'day' });
    expect(ts.metric).toBe('articles');
    expect(ts.period).toBe('day');
    // Two distinct publish days (daysAgo 3 ×2, daysAgo 1 ×1) within the 30-day window.
    expect(ts.buckets).toHaveLength(2);
    expect(ts.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(3);
    expect(ts.buckets.map((b) => b.count).sort()).toEqual([1, 2]);
  });
});
