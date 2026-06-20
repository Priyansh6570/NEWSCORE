import { Schema, Types } from 'mongoose';

/** Mongoose model name for refresh tokens (tenant DB). */
export const REFRESH_TOKEN_MODEL = 'RefreshToken';

export type RefreshTokenStatus = 'active' | 'rotated' | 'revoked';

/**
 * A single refresh token in a rotation family. Only the SHA-256 hash of the
 * token is stored — never the token itself. Presenting a non-active token
 * (rotated/revoked/expired) is treated as theft and burns the whole family.
 * See CLAUDE.md §3, §11.
 */
export interface RefreshTokenDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  status: RefreshTokenStatus;
  expiresAt: Date;
  createdAt: Date;
}

export const RefreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    status: {
      type: String,
      enum: ['active', 'rotated', 'revoked'],
      default: 'active',
    },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'refresh_tokens' },
);

RefreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
RefreshTokenSchema.index({ familyId: 1 });
RefreshTokenSchema.index({ userId: 1 });
// TTL: Mongo reaps documents once expiresAt passes (expireAfterSeconds: 0).
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
