import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { USER_MODEL, type UserDoc } from './user.schema';

@Injectable()
export class UsersService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  /** The User model on the active tenant's connection. */
  private model(): Model<UserDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<UserDoc>(USER_MODEL);
  }

  /**
   * Find a user by phone, or create a default reader (no roles) if none exists.
   * Used by OTP verification — the first successful login provisions the reader.
   */
  async findOrCreateByPhone(phone: string): Promise<UserDoc> {
    const Model = this.model();
    const existing = await Model.findOne({ phone }).lean<UserDoc>().exec();
    if (existing) return existing;
    const created = await Model.create({
      name: phone, // a display name can be set later from the profile
      phone,
      roleIds: [],
      status: 'active',
    });
    return created.toObject();
  }

  async findById(id: string): Promise<UserDoc | null> {
    return this.model().findById(id).lean<UserDoc>().exec();
  }
}
