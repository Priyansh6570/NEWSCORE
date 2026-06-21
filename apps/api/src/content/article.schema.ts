import { Schema, Types } from 'mongoose';

/** Mongoose model name for articles (tenant DB). */
export const ARTICLE_MODEL = 'Article';

export type ArticleStatus = 'draft' | 'review' | 'scheduled' | 'published' | 'archived';

export const ARTICLE_STATUSES: readonly ArticleStatus[] = [
  'draft',
  'review',
  'scheduled',
  'published',
  'archived',
];

/** SEO overrides for an article; falls back to title/excerpt when absent. */
export interface ArticleSeo {
  title?: string;
  description?: string;
  ogImage?: string;
}

/**
 * An article — the reference content type. Lives in the tenant DB; every query
 * runs through the tenant connection. taxonomy/media refs (categoryId, tagIds,
 * editionIds, coverMediaId, mediaIds) are validated as ObjectIds for now and
 * owned by their modules later. See CLAUDE.md §6.3.
 */
export interface ArticleDoc {
  _id: Types.ObjectId;
  title: string;
  slug: string; // unique within the tenant
  excerpt?: string;
  body: Record<string, unknown>; // rich content JSON (TipTap)
  status: ArticleStatus;
  categoryId?: Types.ObjectId;
  tagIds: Types.ObjectId[];
  editionIds: Types.ObjectId[];
  authorId: Types.ObjectId;
  coverMediaId?: Types.ObjectId;
  mediaIds: Types.ObjectId[];
  isBreaking: boolean;
  isFeatured: boolean;
  seo: ArticleSeo;
  scheduledAt?: Date;
  publishedAt?: Date;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

const SeoSchema = new Schema<ArticleSeo>(
  {
    title: { type: String, trim: true },
    description: { type: String, trim: true },
    ogImage: { type: String, trim: true },
  },
  { _id: false },
);

export const ArticleSchema = new Schema<ArticleDoc>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    excerpt: { type: String, trim: true },
    body: { type: Schema.Types.Mixed, required: true, default: {} },
    status: {
      type: String,
      enum: ARTICLE_STATUSES,
      default: 'draft',
    },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    tagIds: { type: [Schema.Types.ObjectId], ref: 'Tag', default: [] },
    editionIds: { type: [Schema.Types.ObjectId], ref: 'Edition', default: [] },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    coverMediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
    mediaIds: { type: [Schema.Types.ObjectId], ref: 'Media', default: [] },
    isBreaking: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    seo: { type: SeoSchema, default: () => ({}) },
    scheduledAt: { type: Date },
    publishedAt: { type: Date },
    views: { type: Number, default: 0 },
  },
  { collection: 'articles', timestamps: true },
);

// slug is unique within the tenant; the rest support the public feed + filters.
ArticleSchema.index({ slug: 1 }, { unique: true });
ArticleSchema.index({ status: 1, publishedAt: -1 });
ArticleSchema.index({ categoryId: 1 });
ArticleSchema.index({ tagIds: 1 });
ArticleSchema.index({ editionIds: 1 });
