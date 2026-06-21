/**
 * Idempotent dev seed.
 *
 * Reads MONGODB_URI + PLATFORM_DB_NAME from apps/api/.env at runtime (via dotenv),
 * so the credential never passes through code review or generation. It seeds
 * whatever that .env points at:
 *
 *   - Platform DB: upsert the `demo` tenant in <platform>.tenants (keyed by slug).
 *   - tenant_demo: ensure the locked Super Admin role (all permissions), then
 *     upsert a dev user carrying that role.
 *
 * Run:  pnpm --filter @newscore/api seed:dev
 *
 * Hard gate: refuses to run with NODE_ENV === 'production'.
 */
import * as path from 'node:path';
import { config as loadEnv } from 'dotenv';
import mongoose from 'mongoose';

import { TENANT_MODEL, TenantSchema } from '../src/platform/tenant.schema';
import { ROLE_MODEL, RoleSchema, type RoleDoc } from '../src/rbac/role.schema';
import { USER_MODEL, UserSchema } from '../src/users/user.schema';
import { PERMISSIONS, SUPER_ADMIN_ROLE_NAME } from '../src/rbac/permissions';
import { SITE_CONFIG_MODEL, SiteConfigSchema } from '../src/site-config/site-config.schema';
import { buildDefaultSiteConfig } from '../src/site-config/site-config.defaults';

// Load apps/api/.env regardless of the cwd the script is launched from.
loadEnv({ path: path.resolve(__dirname, '../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var ${name} (expected in apps/api/.env)`);
  }
  return value;
}

const DEMO_TENANT = {
  slug: 'demo',
  name: 'Demo Paper',
  domains: ['localhost', 'demo.localhost'],
  dbName: 'tenant_demo',
  status: 'active' as const,
  storagePrefix: 'demo/',
  plan: 'standard',
};

const DEV_USER = {
  phone: '+15550001111',
  name: 'Dev Admin',
  status: 'active' as const,
};

/** "created" if the upsert inserted a new doc, otherwise "updated". */
function outcome(res: { upsertedCount?: number }): 'created' | 'updated' {
  return res.upsertedCount && res.upsertedCount > 0 ? 'created' : 'updated';
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the dev seed with NODE_ENV=production.');
  }

  const uri = requireEnv('MONGODB_URI');
  const platformDb = process.env.PLATFORM_DB_NAME?.trim() || 'newscore_platform';

  // One cluster connection; switch DBs with useDb, mirroring MongoService.
  const base = await mongoose.createConnection(uri, { maxPoolSize: 5 }).asPromise();
  try {
    // ── Platform DB: the demo tenant ──────────────────────────────────────
    const platform = base.useDb(platformDb, { useCache: true });
    const Tenant = platform.model(TENANT_MODEL, TenantSchema);
    const tenantRes = await Tenant.updateOne(
      { slug: DEMO_TENANT.slug },
      { $set: DEMO_TENANT, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    ).exec();
    console.log(`tenant '${DEMO_TENANT.slug}' (${platformDb}.tenants): ${outcome(tenantRes)}`);
    const tenant = await Tenant.findOne({ slug: DEMO_TENANT.slug }).lean<{ _id: unknown }>().exec();
    if (!tenant) throw new Error('Demo tenant missing after upsert.');
    const tenantId = String(tenant._id);

    // ── Tenant DB: Super Admin role + dev user ────────────────────────────
    const tenantDb = base.useDb(DEMO_TENANT.dbName, { useCache: true });
    const Role = tenantDb.model<RoleDoc>(ROLE_MODEL, RoleSchema);
    const User = tenantDb.model(USER_MODEL, UserSchema);

    // Same shape as the rbac seed: all permissions, locked system role.
    const roleRes = await Role.updateOne(
      { name: SUPER_ADMIN_ROLE_NAME },
      { $set: { permissions: [...PERMISSIONS], isSystem: true } },
      { upsert: true },
    ).exec();
    const role = await Role.findOne({ name: SUPER_ADMIN_ROLE_NAME }).lean<RoleDoc>().exec();
    if (!role) throw new Error('Super Admin role missing after upsert.');
    console.log(`role '${SUPER_ADMIN_ROLE_NAME}' (${DEMO_TENANT.dbName}.roles): ${outcome(roleRes)}`);

    const userRes = await User.updateOne(
      { phone: DEV_USER.phone },
      { $set: { ...DEV_USER, roleIds: [role._id] }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    ).exec();
    console.log(
      `user '${DEV_USER.phone}' (${DEMO_TENANT.dbName}.users): ${outcome(userRes)} ` +
        `-> roleIds:[${role._id.toString()}]`,
    );

    // Ensure a default SiteConfig exists (one doc/tenant). $setOnInsert so a
    // re-run never clobbers admin edits — only creates it when absent.
    const SiteConfig = tenantDb.model(SITE_CONFIG_MODEL, SiteConfigSchema);
    const cfgRes = await SiteConfig.updateOne(
      { tenantId },
      { $setOnInsert: buildDefaultSiteConfig(tenantId, DEMO_TENANT.name) },
      { upsert: true },
    ).exec();
    console.log(`site-config (${DEMO_TENANT.dbName}.site_config): ${outcome(cfgRes)}`);

    console.log('Dev seed complete.');
  } finally {
    await base.close();
  }
}

main().catch((err) => {
  console.error('Dev seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
