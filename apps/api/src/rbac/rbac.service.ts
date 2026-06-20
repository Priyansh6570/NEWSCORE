import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ROLE_MODEL, type RoleDoc } from './role.schema';
import { PERMISSIONS, SUPER_ADMIN_ROLE_NAME } from './permissions';

@Injectable()
export class RbacService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  private model(): Model<RoleDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<RoleDoc>(ROLE_MODEL);
  }

  /**
   * Idempotently ensure the locked Super Admin role (all permissions) exists for
   * the active tenant. Called during tenant provisioning (CLAUDE.md §14, step 6);
   * its permission list is kept in sync with the catalog on every call.
   */
  async ensureSuperAdminRole(): Promise<RoleDoc> {
    const role = await this.model()
      .findOneAndUpdate(
        { name: SUPER_ADMIN_ROLE_NAME },
        { $set: { permissions: [...PERMISSIONS], isSystem: true } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean<RoleDoc>()
      .exec();
    return role;
  }
}
