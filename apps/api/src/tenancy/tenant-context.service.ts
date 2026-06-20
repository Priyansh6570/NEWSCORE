import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TENANT_CLS_KEY, type TenantContext } from './tenant-context';

/**
 * Reads the active tenant from CLS. Inject this anywhere a service needs the
 * current tenant — e.g. `mongo.tenant(tenantContext.dbName)`.
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  /** The active tenant, or throw if called outside a tenant-resolved request. */
  get(): TenantContext {
    const tenant = this.cls.get<TenantContext | undefined>(TENANT_CLS_KEY);
    if (!tenant) {
      throw new Error('Tenant context is not available on this request');
    }
    return tenant;
  }

  get dbName(): string {
    return this.get().dbName;
  }

  get slug(): string {
    return this.get().slug;
  }

  get id(): string {
    return this.get().id;
  }
}
