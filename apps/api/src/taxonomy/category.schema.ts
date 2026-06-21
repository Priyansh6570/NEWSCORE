import { Schema, Types } from 'mongoose';

/** Mongoose model name for categories (tenant DB). */
export const CATEGORY_MODEL = 'Category';

/**
 * A content category. Self-referential via parentId so the client can build a
 * tree; order sorts siblings. Lives in the tenant DB. See CLAUDE.md §6.3.
 */
export interface CategoryDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string; // unique within the tenant
  parentId?: Types.ObjectId;
  order: number;
}

export const CategorySchema = new Schema<CategoryDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category' },
    order: { type: Number, default: 0 },
  },
  { collection: 'categories' },
);

CategorySchema.index({ slug: 1 }, { unique: true });
CategorySchema.index({ parentId: 1 });
