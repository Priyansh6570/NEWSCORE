import type { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { EncryptionService } from '../common/encryption.service';
import type { RedisService } from '../redis/redis.service';
import { startIntDb, TEST_DB_NAME, type IntDb } from '../test/int-db';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { SiteConfigService } from './site-config.service';
import { SITE_CONFIG_MODEL, SiteConfigSchema } from './site-config.schema';

/**
 * Real-Mongo specs for the module's #1 rule: integrations/secrets must never
 * reach the public view or the cache, must be stored encrypted, and must be
 * decryptable only via the internal (no-endpoint) accessor. Runs the real
 * service against in-memory Mongo with a fake Redis and a real EncryptionService.
 */
describe('SiteConfigService (integration, real Mongo)', () => {
  let db: IntDb;
  let service: SiteConfigService;
  let cache: Map<string, string>;

  const tenantId = new Types.ObjectId().toString();

  beforeAll(async () => {
    db = await startIntDb([[SITE_CONFIG_MODEL, SiteConfigSchema]]);

    const ctx = {
      dbName: TEST_DB_NAME,
      tenantId,
      id: tenantId,
      slug: 'demo',
    } as unknown as TenantContextService;

    // Minimal in-memory Redis: only get/set/del are used by the service.
    cache = new Map<string, string>();
    const redis = {
      get: async (k: string) => cache.get(k) ?? null,
      set: async (k: string, v: string) => {
        cache.set(k, v);
        return 'OK';
      },
      del: async (k: string) => (cache.delete(k) ? 1 : 0),
    } as unknown as RedisService;

    const config = {
      get: () => 'int-test-secrets-enc-key-0123456789',
    } as unknown as ConfigService<Record<string, unknown>, true>;
    const encryption = new EncryptionService(config as never);

    service = new SiteConfigService(db.mongo, ctx, redis, encryption);
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset(SITE_CONFIG_MODEL);
    cache.clear();
  });

  it('public view creates a sensible default and NEVER carries integrations', async () => {
    const view = await service.getPublicView();

    expect(view.brand.name).toBe('demo'); // slug fallback (no platform tenant in test)
    expect(view.features.comments).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(view, 'integrations')).toBe(false);
  });

  describe('after Razorpay keys are set', () => {
    const keys = { keyId: 'rzp_test_KEY', keySecret: 'PLAINTEXT_SECRET', webhookSecret: 'WH_SECRET' };

    it('stores secrets encrypted, exposes only status to admin, and leaks nothing public', async () => {
      const status = await service.setRazorpayKeys(keys);
      expect(status).toEqual({ configured: true, keyId: 'rzp_test_KEY' });

      // public view: still no integrations, no secret material anywhere
      const pub = await service.getPublicView();
      expect(Object.prototype.hasOwnProperty.call(pub, 'integrations')).toBe(false);
      expect(JSON.stringify(pub)).not.toContain('PLAINTEXT_SECRET');

      // admin view: presence + keyId only — no secrets, encrypted or otherwise
      const admin = await service.getAdminView();
      expect(admin.integrations.razorpay).toEqual({ configured: true, keyId: 'rzp_test_KEY' });
      const adminJson = JSON.stringify(admin);
      expect(adminJson).not.toContain('PLAINTEXT_SECRET');
      expect(adminJson).not.toContain('keySecretEnc');

      // at rest: the stored secret is ciphertext, not the plaintext
      const raw = await db.mongo.tenant(TEST_DB_NAME).collection('site_config').findOne({});
      const stored = raw?.integrations?.razorpay;
      expect(stored.keySecretEnc).toBeDefined();
      expect(stored.keySecretEnc).not.toContain('PLAINTEXT_SECRET');
    });

    it('decrypts only via the internal accessor (round-trip)', async () => {
      await service.setRazorpayKeys(keys);
      const decrypted = await service.getDecryptedRazorpay();
      expect(decrypted).toEqual(keys);
    });
  });

  it('updateConfig merges feature flags — a partial toggle preserves the others', async () => {
    await service.getPublicView(); // seed the default (all flags false)
    await service.updateConfig({ features: { comments: true } });

    const features = await service.getFeatures();
    expect(features.comments).toBe(true);
    expect(features.epaper).toBe(false); // sibling flag preserved, not dropped
  });

  it('invalidates the cache on write so updates are visible immediately', async () => {
    await service.getPublicView(); // populate cache
    expect(cache.size).toBe(1);

    await service.updateConfig({ brand: { name: 'Renamed' } });
    expect(cache.size).toBe(0); // write cleared it

    expect((await service.getPublicView()).brand.name).toBe('Renamed');
  });
});
