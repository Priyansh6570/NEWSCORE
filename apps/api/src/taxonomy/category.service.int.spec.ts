import { startIntDb, TEST_DB_NAME, type IntDb } from '../test/int-db';
import { CATEGORY_MODEL, CategorySchema } from './category.schema';
import { CategoryService } from './category.service';

/**
 * Real-Mongo check that the shared slug helper (common/slug.ts) uniquifies
 * against an actual collection — the exists()-then-bump loop only holds if it
 * sees real persisted rows.
 */
describe('CategoryService (integration, real Mongo)', () => {
  let db: IntDb;
  let service: CategoryService;

  beforeAll(async () => {
    db = await startIntDb([[CATEGORY_MODEL, CategorySchema]]);
    service = new CategoryService(db.mongo, db.ctx);
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset(CATEGORY_MODEL);
  });

  it('derives distinct slugs for two categories sharing a name (x, x-2)', async () => {
    const first = await service.create({ name: 'District News' });
    const second = await service.create({ name: 'District News' });

    expect(first.slug).toBe('district-news');
    expect(second.slug).toBe('district-news-2');
  });

  it('enforces slug uniqueness at the index — the real guard behind uniqueSlug', async () => {
    await service.create({ name: 'District News' }); // slug: district-news
    // Bypass the service and insert a colliding slug directly; the unique index
    // must reject it (duplicate key), proving the constraint is real, not just
    // the application-level exists()-then-bump loop.
    const model = db.mongo.tenant(TEST_DB_NAME).model(CATEGORY_MODEL);
    await expect(model.create({ name: 'Other', slug: 'district-news' })).rejects.toMatchObject({
      code: 11000,
    });
  });
});
