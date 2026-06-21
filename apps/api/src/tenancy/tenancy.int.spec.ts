import { type Model, Types } from 'mongoose';
import { ARTICLE_MODEL, ArticleSchema, type ArticleDoc } from '../content/article.schema';
import { startIntDb, type IntDb } from '../test/int-db';

/**
 * The platform's #1 invariant: tenant data is structurally isolated by database
 * (CLAUDE.md §2 principle 4; §5). This drives the REAL MongoService.useDb path
 * against an in-memory MongoDB, so a regression where tenant() stops switching
 * databases — or queries fall back to the base/platform DB — fails here. A
 * standing guard, not a one-time smoke test.
 */
describe('Tenant DB isolation (integration, real Mongo)', () => {
  const DB_A = 'tenant_a';
  const DB_B = 'tenant_b';

  let db: IntDb;

  beforeAll(async () => {
    db = await startIntDb([[ARTICLE_MODEL, ArticleSchema]]);
    // Build the unique-slug index in BOTH tenant DBs so the same-slug isolation
    // proof below actually leans on a real per-collection unique constraint.
    await articles(DB_A).createIndexes();
    await articles(DB_B).createIndexes();
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  const articles = (dbName: string): Model<ArticleDoc> =>
    db.mongo.tenant(dbName).model<ArticleDoc>(ARTICLE_MODEL);

  beforeEach(async () => {
    await Promise.all([
      articles(DB_A).deleteMany({}).exec(),
      articles(DB_B).deleteMany({}).exec(),
      db.mongo.platform().collection('articles').deleteMany({}),
    ]);
  });

  /** Minimal valid Article in the given tenant DB. */
  function write(dbName: string, slug: string): Promise<ArticleDoc> {
    return articles(dbName).create({
      title: slug,
      slug,
      body: {},
      status: 'published',
      authorId: new Types.ObjectId(),
    });
  }

  it("a write in tenant_a is invisible from tenant_b and from the platform DB", async () => {
    await write(DB_A, 'a-only');

    // tenant_b must not see tenant_a's data
    expect(await articles(DB_B).countDocuments({}).exec()).toBe(0);
    expect(await articles(DB_B).findOne({ slug: 'a-only' }).lean().exec()).toBeNull();

    // nor may it leak into the shared platform DB (query the raw collection so
    // this doesn't depend on the Article model being registered there)
    expect(await db.mongo.platform().collection('articles').countDocuments({})).toBe(0);

    // sanity: tenant_a really does hold it
    expect(await articles(DB_A).findOne({ slug: 'a-only' }).lean().exec()).not.toBeNull();
  });

  it('each tenant sees only its own document', async () => {
    await write(DB_A, 'doc-a');
    await write(DB_B, 'doc-b');

    const inA = await articles(DB_A).find({}).lean<ArticleDoc[]>().exec();
    const inB = await articles(DB_B).find({}).lean<ArticleDoc[]>().exec();

    expect(inA.map((d) => d.slug)).toEqual(['doc-a']);
    expect(inB.map((d) => d.slug)).toEqual(['doc-b']);
  });

  it('the SAME slug coexists in two tenants — separate collections, separate unique indexes', async () => {
    await write(DB_A, 'shared-slug');
    // The identical slug in tenant_b must NOT trip tenant_a's unique index. It
    // succeeding proves the write landed in a physically distinct collection —
    // the cleanest possible demonstration that useDb really separated the data.
    await expect(write(DB_B, 'shared-slug')).resolves.toBeDefined();

    expect(await articles(DB_A).countDocuments({}).exec()).toBe(1);
    expect(await articles(DB_B).countDocuments({}).exec()).toBe(1);
  });
});
