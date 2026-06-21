import { Injectable, Logger } from '@nestjs/common';
import type { Model } from 'mongoose';
import { MongoService } from '../database/mongo.service';
import { RedisService } from '../redis/redis.service';
import { TENANT_MODEL, TenantSchema } from './tenant.schema';
import type { TenantDoc, TenantStatus } from './tenant.schema';

export interface ResolvedTenant {
  id: string;
  slug: string;
  dbName: string;
  domains: string[]; // the tenant's known hosts; domains[0] is canonical
  status: TenantStatus;
}

const HOST_CACHE_PREFIX = 'tenant:host:';
const CACHE_TTL_SECONDS = 60;
const NEGATIVE = '__neg__'; // sentinel: this host has no tenant (cache the miss too)

@Injectable()
export class TenantRegistryService {
  private readonly logger = new Logger(TenantRegistryService.name);

  constructor(
    private readonly mongo: MongoService,
    private readonly redis: RedisService,
  ) {}

  /** The Tenant model on the platform connection, registered once. */
  private model(): Model<TenantDoc> {
    const conn = this.mongo.platform();
    return (
      (conn.models[TENANT_MODEL] as Model<TenantDoc> | undefined) ??
      conn.model<TenantDoc>(TENANT_MODEL, TenantSchema)
    );
  }

  /**
   * Resolve a tenant from a request host. Cached in Redis for ~60s, including
   * negative lookups so unknown hosts don't hammer the Platform DB.
   */
  async resolveByHost(host: string): Promise<ResolvedTenant | null> {
    if (!host) return null;
    const key = `${HOST_CACHE_PREFIX}${host}`;

    const cached = await this.redis.get(key);
    if (cached === NEGATIVE) {
      this.logger.debug(`tenant cache HIT (negative) host=${host}`);
      return null;
    }
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as ResolvedTenant;
        this.logger.debug(`tenant cache HIT host=${host}`);
        return parsed;
      } catch {
        // Malformed/stale cache entry (e.g. an old sentinel) — fall through to a
        // DB lookup rather than throwing; the bad entry gets overwritten below.
        this.logger.warn(`tenant cache entry unparseable host=${host} -> querying platform DB`);
      }
    } else {
      this.logger.debug(`tenant cache MISS host=${host} -> querying platform DB`);
    }

    const doc = await this.model().findOne({ domains: host }).lean().exec();
    if (!doc) {
      await this.redis.set(key, NEGATIVE, 'EX', CACHE_TTL_SECONDS);
      return null;
    }

    const resolved: ResolvedTenant = {
      id: String(doc._id),
      slug: doc.slug,
      dbName: doc.dbName,
      domains: doc.domains ?? [],
      status: doc.status,
    };
    await this.redis.set(key, JSON.stringify(resolved), 'EX', CACHE_TTL_SECONDS);
    return resolved;
  }
}
