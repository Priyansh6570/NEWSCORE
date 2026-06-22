/**
 * Ensure a tenant DB's Atlas Search index for articles.
 *
 * For the given tenant DB it (a) recomputes `searchText` for every article from
 * title+excerpt+body (so existing rows become searchable), then (b) creates the
 * 'default' Atlas Search index on the `articles` collection, mapping title,
 * excerpt, and searchText as searchable strings. Idempotent: if 'default' already
 * exists it is left as-is.
 *
 * Reads MONGODB_URI from apps/api/.env (like seed-dev), so the credential never
 * passes through code. Each tenant DB needs its own 'default' index — fold this
 * into provisioning later; for now it does one DB (default tenant_demo).
 *
 *   pnpm --filter @newscore/api ensure-search-index            # tenant_demo
 *   pnpm --filter @newscore/api ensure-search-index tenant_x   # another DB
 *
 * Local note: atlas-local is a single-node replica set — run with
 *   MONGODB_URI="mongodb://localhost:27017/?directConnection=true"
 * or the driver tries the container's internal hostname (ENOTFOUND).
 */
import * as path from 'node:path';
import { config as loadEnv } from 'dotenv';
import mongoose from 'mongoose';

import { ARTICLE_MODEL, ArticleSchema, type ArticleDoc } from '../src/content/article.schema';
import { buildSearchText } from '../src/content/article.search-text';

loadEnv({ path: path.resolve(__dirname, '../.env') });

const SEARCH_INDEX_NAME = 'default';

const SEARCH_INDEX_DEFINITION = {
  mappings: {
    dynamic: false,
    fields: {
      title: { type: 'string', analyzer: 'lucene.standard' },
      excerpt: { type: 'string', analyzer: 'lucene.standard' },
      searchText: { type: 'string', analyzer: 'lucene.standard' },
    },
  },
} as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var ${name} (expected in apps/api/.env)`);
  }
  return value;
}

async function main(): Promise<void> {
  const uri = requireEnv('MONGODB_URI');
  const dbName = process.argv[2]?.trim() || 'tenant_demo';

  const base = await mongoose.createConnection(uri, { maxPoolSize: 5 }).asPromise();
  try {
    const db = base.useDb(dbName, { useCache: true });
    const Article = db.model<ArticleDoc>(ARTICLE_MODEL, ArticleSchema);

    // ── (a) Backfill searchText for every article ─────────────────────────
    // searchText is select:false on the schema — pull it in so the idempotent
    // "did it change?" comparison below is accurate.
    const articles = await Article.find().select('+searchText').lean<ArticleDoc[]>().exec();
    let updated = 0;
    for (const a of articles) {
      const searchText = buildSearchText({ title: a.title, excerpt: a.excerpt, body: a.body });
      if (searchText !== a.searchText) {
        await Article.updateOne({ _id: a._id }, { $set: { searchText } }).exec();
        updated++;
      }
    }
    console.log(`searchText backfill (${dbName}.articles): ${updated}/${articles.length} updated`);

    // ── (b) Ensure the 'default' Atlas Search index ───────────────────────
    const native = db.db;
    if (!native) throw new Error('Native Db handle unavailable on the tenant connection.');
    const coll = native.collection('articles');

    const existing = await coll.listSearchIndexes().toArray();
    if (existing.some((i) => i.name === SEARCH_INDEX_NAME)) {
      console.log(`search index '${SEARCH_INDEX_NAME}' (${dbName}.articles): already exists — skipping`);
    } else {
      await coll.createSearchIndex({
        name: SEARCH_INDEX_NAME,
        definition: SEARCH_INDEX_DEFINITION,
      });
      console.log(
        `search index '${SEARCH_INDEX_NAME}' (${dbName}.articles): created ` +
          `(it takes a few seconds to build before $search returns hits)`,
      );
    }

    console.log('ensure-search-index complete.');
  } finally {
    await base.close();
  }
}

main().catch((err) => {
  console.error('ensure-search-index failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
