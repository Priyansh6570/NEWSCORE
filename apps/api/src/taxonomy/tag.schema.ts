import { Schema, Types } from 'mongoose';

/** Mongoose model name for tags (tenant DB). */
export const TAG_MODEL = 'Tag';

/** A free-form tag. Lives in the tenant DB. See CLAUDE.md §6.3. */
export interface TagDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string; // unique within the tenant
}

export const TagSchema = new Schema<TagDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
  },
  { collection: 'tags' },
);

TagSchema.index({ slug: 1 }, { unique: true });
