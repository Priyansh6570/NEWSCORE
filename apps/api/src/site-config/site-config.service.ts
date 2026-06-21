import { Injectable } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { EncryptionService } from '../common/encryption.service';
import { MongoService } from '../database/mongo.service';
import { RedisService } from '../redis/redis.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { buildDefaultSiteConfig } from './site-config.defaults';
import { SITE_CONFIG_MODEL, type FeatureFlags, type SiteConfigDoc } from './site-config.schema';
import {
  type AdminSiteConfigView,
  type PublicSiteConfigView,
  type RazorpayStatus,
  type SetRazorpayKeysDto,
  type UpdateSiteConfigDto,
} from './dto/site-config.dto';

const CACHE_TTL_SECONDS = 60;

@Injectable()
export class SiteConfigService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
    private readonly redis: RedisService,
    private readonly encryption: EncryptionService,
  ) {}

  private model(): Model<SiteConfigDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<SiteConfigDoc>(SITE_CONFIG_MODEL);
  }

  /** Cache key holds ONLY the public view — secrets never enter Redis. */
  private cacheKey(): string {
    return `tenant:${this.ctx.tenantId}:siteconfig:public`;
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /**
   * Public, white-label config — cached per tenant (~60s). Builds and persists a
   * default on first access. Never carries integrations or any secret.
   */
  async getPublicView(): Promise<PublicSiteConfigView> {
    const cached = await this.redis.get(this.cacheKey());
    if (cached) return JSON.parse(cached) as PublicSiteConfigView;

    const doc = await this.getOrCreateDefault();
    const view = toPublicView(doc);
    await this.redis.set(this.cacheKey(), JSON.stringify(view), 'EX', CACHE_TTL_SECONDS);
    return view;
  }

  /** The tenant's feature flags (off the cached public view). Used by FeatureGuard. */
  async getFeatures(): Promise<FeatureFlags> {
    return (await this.getPublicView()).features;
  }

  /** Admin view: editable config + integration STATUS only (no secrets). */
  async getAdminView(): Promise<AdminSiteConfigView> {
    const doc = await this.getOrCreateDefault();
    return {
      ...toPublicView(doc),
      integrations: {
        razorpay: {
          configured: Boolean(doc.integrations?.razorpay),
          keyId: doc.integrations?.razorpay?.keyId,
        },
        sms: {
          configured: Boolean(doc.integrations?.sms),
          senderId: doc.integrations?.sms?.senderId,
        },
      },
    };
  }

  // ── Writes (each invalidates the cache) ────────────────────────────────────

  /**
   * Patch editable public fields. Provided sections replace wholesale, except
   * feature flags which merge (so toggling one flag doesn't drop the rest).
   * Integrations are NOT settable here.
   */
  async updateConfig(dto: UpdateSiteConfigDto): Promise<AdminSiteConfigView> {
    await this.getOrCreateDefault();

    const $set: Record<string, unknown> = {};
    if (dto.brand !== undefined) $set.brand = dto.brand;
    if (dto.contact !== undefined) $set.contact = dto.contact;
    if (dto.social !== undefined) $set.social = dto.social;
    if (dto.locale !== undefined) $set.locale = dto.locale;
    if (dto.templateId !== undefined) $set.templateId = dto.templateId;
    if (dto.theme !== undefined) $set.theme = dto.theme;
    if (dto.layouts !== undefined) $set.layouts = dto.layouts;
    if (dto.customCss !== undefined) $set.customCss = dto.customCss;
    // Merge feature flags so a partial toggle preserves the others.
    if (dto.features) {
      for (const [flag, on] of Object.entries(dto.features)) $set[`features.${flag}`] = on;
    }

    if (Object.keys($set).length > 0) {
      await this.model().updateOne({ tenantId: this.tenantId() }, { $set }).exec();
    }
    await this.invalidate();
    return this.getAdminView();
  }

  /**
   * Encrypt and store the tenant's Razorpay keys. Returns only a status — the
   * secrets are never echoed back, logged, or cached.
   */
  async setRazorpayKeys(dto: SetRazorpayKeysDto): Promise<RazorpayStatus> {
    await this.getOrCreateDefault();
    await this.model()
      .updateOne(
        { tenantId: this.tenantId() },
        {
          $set: {
            'integrations.razorpay': {
              keyId: dto.keyId,
              keySecretEnc: this.encryption.encrypt(dto.keySecret),
              webhookSecretEnc: this.encryption.encrypt(dto.webhookSecret),
            },
          },
        },
      )
      .exec();
    await this.invalidate();
    return { configured: true, keyId: dto.keyId };
  }

  /**
   * INTERNAL ONLY — for the payments module. No endpoint exposes this. Returns
   * the decrypted Razorpay credentials, or null if none are configured.
   */
  async getDecryptedRazorpay(): Promise<{
    keyId: string;
    keySecret: string;
    webhookSecret: string;
  } | null> {
    const doc = await this.getOrCreateDefault();
    const r = doc.integrations?.razorpay;
    if (!r) return null;
    return {
      keyId: r.keyId,
      keySecret: this.encryption.decrypt(r.keySecretEnc),
      webhookSecret: this.encryption.decrypt(r.webhookSecretEnc),
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(this.ctx.tenantId);
  }

  /** The tenant's full config doc; creates the default on first access. */
  async getOrCreateDefault(): Promise<SiteConfigDoc> {
    const model = this.model();
    const existing = await model.findOne({ tenantId: this.tenantId() }).lean<SiteConfigDoc>().exec();
    if (existing) return existing;

    const def = buildDefaultSiteConfig(this.ctx.tenantId, await this.tenantBrandName());
    try {
      const created = await model.create(def);
      return created.toObject();
    } catch {
      // Lost a concurrent create race (unique tenantId) — return the winner.
      const again = await model.findOne({ tenantId: this.tenantId() }).lean<SiteConfigDoc>().exec();
      if (again) return again;
      throw new Error('Failed to create default SiteConfig');
    }
  }

  /** The tenant's display name from the platform registry; slug as fallback. */
  private async tenantBrandName(): Promise<string> {
    try {
      const t = await this.mongo
        .platform()
        .collection('tenants')
        .findOne({ _id: new Types.ObjectId(this.ctx.id) });
      return (t?.name as string | undefined) ?? this.ctx.slug;
    } catch {
      return this.ctx.slug;
    }
  }

  private async invalidate(): Promise<void> {
    await this.redis.del(this.cacheKey());
  }
}

/** Map a config doc to the PUBLIC view. The integrations field is omitted here
 *  by construction — this is the single most important rule in the module. */
function toPublicView(doc: SiteConfigDoc): PublicSiteConfigView {
  return {
    brand: doc.brand,
    contact: doc.contact ?? {},
    social: doc.social ?? {},
    theme: doc.theme,
    templateId: doc.templateId,
    layouts: doc.layouts ?? [],
    features: doc.features,
    locale: doc.locale,
    customCss: doc.customCss,
  };
}
