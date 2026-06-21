import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { MongoService } from '../database/mongo.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { RefreshTokenService } from './refresh-token.service';

/**
 * Minimal in-memory stand-in for the Mongoose RefreshToken model. It tracks docs
 * in an array so the family-burn logic is genuinely exercised: findOne returns
 * the live doc reference (so .save() persists status mutations), and updateMany
 * mutates every matching doc in place.
 */
interface FakeDoc {
  userId: unknown;
  familyId: string;
  tokenHash: string;
  status: 'active' | 'rotated' | 'revoked';
  expiresAt: Date;
  save: jest.Mock<Promise<void>, []>;
}

class FakeRefreshModel {
  readonly docs: FakeDoc[] = [];

  // eslint-disable-next-line @typescript-eslint/require-await
  async findOne(query: { tokenHash: string }): Promise<FakeDoc | null> {
    return this.docs.find((d) => d.tokenHash === query.tokenHash) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async create(data: Omit<FakeDoc, 'save'>): Promise<FakeDoc> {
    const doc: FakeDoc = { ...data, save: jest.fn<Promise<void>, []>().mockResolvedValue() };
    this.docs.push(doc);
    return doc;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async updateMany(
    filter: { familyId?: string; userId?: unknown; status?: string },
    update: { status: FakeDoc['status'] },
  ): Promise<{ modifiedCount: number }> {
    let modifiedCount = 0;
    for (const d of this.docs) {
      const familyOk = filter.familyId === undefined || d.familyId === filter.familyId;
      const userOk = filter.userId === undefined || d.userId === filter.userId;
      const statusOk = filter.status === undefined || d.status === filter.status;
      if (familyOk && userOk && statusOk) {
        d.status = update.status;
        modifiedCount++;
      }
    }
    return { modifiedCount };
  }
}

describe('RefreshTokenService — reuse detection', () => {
  let model: FakeRefreshModel;
  let service: RefreshTokenService;
  const userId = 'user-123';

  beforeEach(() => {
    model = new FakeRefreshModel();
    const mongo = {
      tenant: jest.fn().mockReturnValue({ model: jest.fn().mockReturnValue(model) }),
    } as unknown as MongoService;
    const ctx = { dbName: 'tenant_test' } as unknown as TenantContextService;
    // REFRESH_TTL_DAYS = 30 → expiresAt is comfortably in the future.
    const config = { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService;
    service = new RefreshTokenService(mongo, ctx, config);
  });

  it('issue() returns a token and creates one active doc', async () => {
    const token = await service.issue(userId);

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(model.docs).toHaveLength(1);
    expect(model.docs[0]).toMatchObject({ userId, status: 'active' });
  });

  it('rotate() marks the presented doc rotated and adds a new active doc in the same family', async () => {
    const token = await service.issue(userId);
    const original = model.docs[0]!;

    const { refresh, userId: returnedUserId } = await service.rotate(token);

    expect(refresh).not.toBe(token);
    expect(returnedUserId).toBe(userId);
    expect(model.docs).toHaveLength(2);

    const fresh = model.docs[1]!;
    expect(original.status).toBe('rotated');
    expect(original.save).toHaveBeenCalledTimes(1);
    expect(fresh.status).toBe('active');
    expect(fresh.familyId).toBe(original.familyId); // same rotation family
  });

  it('replaying a spent token throws and burns the entire family', async () => {
    const token = await service.issue(userId);
    await service.rotate(token); // token is now spent (rotated)

    // Same spent token presented again → reuse.
    await expect(service.rotate(token)).rejects.toBeInstanceOf(UnauthorizedException);

    // Every doc in that family must now be revoked (the burn ran).
    const familyId = model.docs[0]!.familyId;
    const family = model.docs.filter((d) => d.familyId === familyId);
    expect(family.length).toBeGreaterThan(0);
    expect(family.every((d) => d.status === 'revoked')).toBe(true);
  });

  it('replaying an expired (but still active) token throws and burns the family', async () => {
    // The other reuse trigger: status is 'active' but expiresAt is in the past.
    const token = 'expired-but-active-token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await model.create({
      userId,
      familyId: 'fam-expired',
      tokenHash,
      status: 'active',
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    // A sibling in the same family to prove the burn spreads across the family.
    await model.create({
      userId,
      familyId: 'fam-expired',
      tokenHash: 'sibling-hash',
      status: 'active',
      expiresAt: new Date(Date.now() + 1_000_000),
    });

    await expect(service.rotate(token)).rejects.toBeInstanceOf(UnauthorizedException);

    const family = model.docs.filter((d) => d.familyId === 'fam-expired');
    expect(family).toHaveLength(2);
    expect(family.every((d) => d.status === 'revoked')).toBe(true);
  });

  it('rotating an unknown token throws and touches no family', async () => {
    await service.issue(userId);
    const before = model.docs.map((d) => d.status);

    await expect(service.rotate('garbage-not-a-real-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // Nothing was revoked/rotated.
    expect(model.docs.map((d) => d.status)).toEqual(before);
    expect(model.docs.every((d) => d.status === 'active')).toBe(true);
  });
});
