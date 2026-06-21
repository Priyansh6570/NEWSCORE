import { Schema, Types } from 'mongoose';

/** Mongoose model name for comments (tenant DB). */
export const COMMENT_MODEL = 'Comment';

export type CommentStatus = 'pending' | 'approved' | 'rejected';

export const COMMENT_STATUSES: readonly CommentStatus[] = ['pending', 'approved', 'rejected'];

/**
 * A reader comment on an article. PRE-MODERATED: new comments default to
 * 'pending' and never appear in the public read until a moderator approves them
 * (the key visibility invariant — see the engagement spec). `body` is PLAIN TEXT
 * and must never be rendered as HTML; the frontend escapes it. authorName is
 * denormalized for display so the public read needs no User join. One level of
 * replies via parentId (a reply's parentId points at a top-level comment).
 * See CLAUDE.md §6.3.
 */
export interface CommentDoc {
  _id: Types.ObjectId;
  articleId: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string; // denormalized snapshot for display
  body: string; // plain text, max ~2000 chars
  status: CommentStatus;
  parentId?: Types.ObjectId; // set on a reply; absent on a top-level comment
  createdAt: Date;
  updatedAt: Date;
}

export const CommentSchema = new Schema<CommentDoc>(
  {
    articleId: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: COMMENT_STATUSES, default: 'pending' },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment' },
  },
  { collection: 'comments', timestamps: true },
);

// Public thread read: approved comments for one article.
CommentSchema.index({ articleId: 1, status: 1 });
// Moderation queue: by status, newest first.
CommentSchema.index({ status: 1, createdAt: -1 });
