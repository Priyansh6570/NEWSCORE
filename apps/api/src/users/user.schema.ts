import { Schema, Types } from 'mongoose';

/** Mongoose model name for users (tenant DB). */
export const USER_MODEL = 'User';

export type UserStatus = 'active' | 'blocked';

/**
 * A user OF this tenant — reader, journalist, editor, or admin. Lives in the
 * tenant DB. Effective permissions are the union of the referenced roles.
 * See CLAUDE.md §6.2.
 */
export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  phone?: string; // primary login (OTP)
  email?: string;
  roleIds: Types.ObjectId[];
  status: UserStatus;
  createdAt: Date;
}

export const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    roleIds: { type: [Schema.Types.ObjectId], ref: 'Role', default: [] },
    status: { type: String, enum: ['active', 'blocked'], default: 'active', index: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'users' },
);

// phone/email are unique only when present (sparse) — a reader may have one or both.
UserSchema.index({ phone: 1 }, { unique: true, sparse: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ roleIds: 1 });
