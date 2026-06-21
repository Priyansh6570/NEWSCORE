import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Schema } from 'mongoose';
import { MongoService } from '../database/mongo.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';

/**
 * Integration-test harness: an in-memory MongoDB driving the REAL MongoService,
 * so the useDb tenant-switching path and actual Mongoose query semantics are
 * exercised — not a hand-mocked model. Use it for invariants that live in query
 * logic (e.g. "a draft never leaks into the public feed").
 *
 * Wiring mirrors production: a stub ConfigService hands MongoService the
 * memory-server URI + a test platform name, onModuleInit opens the base
 * connection, the schema(s) under test are registered, and a stub
 * TenantContextService pins a fixed tenant dbName so every query is scoped.
 */
export const TEST_DB_NAME = 'tenant_test';

export interface IntDb {
  mongo: MongoService;
  ctx: TenantContextService;
  /** Empty the named collection between tests for isolation. */
  reset(modelName: string): Promise<void>;
  stop(): Promise<void>;
}

export async function startIntDb(models: Array<[string, Schema]>): Promise<IntDb> {
  const mem = await MongoMemoryServer.create();
  const uri = mem.getUri();

  const config = {
    get: (key: string) => {
      if (key === 'MONGODB_URI') return uri;
      if (key === 'PLATFORM_DB_NAME') return 'test_platform';
      return undefined;
    },
  } as unknown as ConstructorParameters<typeof MongoService>[0];

  const mongo = new MongoService(config);
  await mongo.onModuleInit();
  // Register before the first tenant() call so the models attach to the cached
  // tenant connection (matches each feature module's onModuleInit).
  for (const [name, schema] of models) mongo.registerTenantModel(name, schema);

  // Build declared indexes (e.g. unique slug) on the in-memory DB so tests
  // exercise the same constraints production relies on — autoIndex is async and
  // unawaited, so without this the "real guard" behind uniqueSlug is absent.
  const conn = mongo.tenant(TEST_DB_NAME);
  for (const [name] of models) await conn.model(name).createIndexes();

  const ctx = { dbName: TEST_DB_NAME } as unknown as TenantContextService;

  return {
    mongo,
    ctx,
    async reset(modelName: string): Promise<void> {
      await mongo.tenant(TEST_DB_NAME).model(modelName).deleteMany({}).exec();
    },
    async stop(): Promise<void> {
      await mongo.onModuleDestroy();
      await mem.stop();
    },
  };
}
