import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import type { Env } from '../config/env.schema';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  REFRESH_TOKEN_MODEL,
  type RefreshTokenDoc,
} from './refresh-token.schema';

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private model(): Model<RefreshTokenDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<RefreshTokenDoc>(REFRESH_TOKEN_MODEL);
  }

  private hash(t: string): string {
    return createHash('sha256').update(t).digest('hex');
  }

  private expiry(): Date {
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  /** Fresh login → brand-new family. */
  async issue(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.model().create({
      userId,
      familyId: randomUUID(),
      tokenHash: this.hash(token),
      status: 'active',
      expiresAt: this.expiry(),
    });
    return token;
  }

  /** Rotate, and burn the family if an already-used token is replayed. */
  async rotate(presented: string): Promise<{ refresh: string; userId: string }> {
    const Model = this.model();
    const record = await Model.findOne({ tokenHash: this.hash(presented) });
    if (!record) throw new UnauthorizedException('Invalid refresh token');

    // REUSE DETECTION: a rotated/revoked/expired token being presented means it leaked.
    if (record.status !== 'active' || record.expiresAt < new Date()) {
      await Model.updateMany({ familyId: record.familyId }, { status: 'revoked' });
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    record.status = 'rotated';
    await record.save();
    const next = randomBytes(32).toString('base64url');
    await Model.create({
      userId: record.userId,
      familyId: record.familyId,
      tokenHash: this.hash(next),
      status: 'active',
      expiresAt: this.expiry(),
    });
    return { refresh: next, userId: String(record.userId) };
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.model().updateMany({ userId, status: 'active' }, { status: 'revoked' });
  }
}
