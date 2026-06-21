import { Schema, Types } from 'mongoose';

/** Mongoose model name for reactions/likes (tenant DB). */
export const REACTION_MODEL = 'Reaction';

/**
 * A single "like" — one per (article, user). The unique compound index enforces
 * idempotence at the data layer; the denormalized Article.likeCount is kept in
 * sync (+1 only when a NEW record is inserted, -1 on removal, never below 0).
 * See CLAUDE.md §6.3.
 */
export interface ReactionDoc {
  _id: Types.ObjectId;
  articleId: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
}

export const ReactionSchema = new Schema<ReactionDoc>(
  {
    articleId: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'reactions' },
);

// One like per user per article — the structural guarantee behind idempotence.
ReactionSchema.index({ articleId: 1, userId: 1 }, { unique: true });
