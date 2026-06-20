import { Schema } from 'mongoose';

/** Mongoose model name for the tenant registry (Platform DB). */
export const TENANT_MODEL = 'Tenant';

export type TenantStatus = 'provisioning' | 'active' | 'suspended';

/** A tenant = one newspaper. Lives in the shared Platform DB. See CLAUDE.md §6.1. */
export interface TenantDoc {
  slug: string;
  name: string;
  domains: string[];
  dbName: string;
  clusterId?: string;
  storagePrefix: string;
  bunnyLibraryId?: string;
  status: TenantStatus;
  plan: string;
  createdAt: Date;
}

export const TenantSchema = new Schema<TenantDoc>(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    domains: { type: [String], required: true, default: [] },
    dbName: { type: String, required: true },
    clusterId: { type: String },
    storagePrefix: { type: String, required: true },
    bunnyLibraryId: { type: String },
    status: {
      type: String,
      enum: ['provisioning', 'active', 'suspended'],
      default: 'provisioning',
      index: true,
    },
    plan: { type: String, required: true, default: 'standard' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'tenants' },
);

// slug uniqueness comes from the field above; enforce per-domain uniqueness
// across tenants (multikey unique on the domains array). See CLAUDE.md §6.1.
TenantSchema.index({ domains: 1 }, { unique: true });
