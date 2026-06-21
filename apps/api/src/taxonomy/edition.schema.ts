import { Schema, Types } from 'mongoose';

/** Mongoose model name for editions (tenant DB). */
export const EDITION_MODEL = 'Edition';

/**
 * An edition — a district/regional split an article can run in. Lives in the
 * tenant DB. See CLAUDE.md §6.3.
 */
export interface EditionDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string; // unique within the tenant
  districtCode?: string;
}

export const EditionSchema = new Schema<EditionDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    districtCode: { type: String, trim: true },
  },
  { collection: 'editions' },
);

EditionSchema.index({ slug: 1 }, { unique: true });
EditionSchema.index({ districtCode: 1 });
