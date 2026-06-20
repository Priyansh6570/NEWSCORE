import { Schema, Types } from 'mongoose';
import type { Permission } from './permissions';

/** Mongoose model name for roles (tenant DB). */
export const ROLE_MODEL = 'Role';

/**
 * A role is DATA — admins create and edit them. It is a name plus a chosen
 * subset of the PERMISSIONS catalog. The 'Super Admin' role is seeded and
 * locked (isSystem). See CLAUDE.md §6.2, §10.
 */
export interface RoleDoc {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  permissions: Permission[];
  isSystem: boolean;
}

export const RoleSchema = new Schema<RoleDoc>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
  },
  { collection: 'roles' },
);

// Role names are unique within a tenant.
RoleSchema.index({ name: 1 }, { unique: true });
