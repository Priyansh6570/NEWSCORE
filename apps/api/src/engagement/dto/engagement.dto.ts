import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { COMMENT_STATUSES, type CommentStatus } from '../comment.schema';

/**
 * Post a comment. `body` is PLAIN TEXT — it is stored and returned verbatim and
 * must never be rendered as HTML (the frontend escapes it). authorId/authorName
 * come from the authenticated principal, never the body. parentId (optional)
 * makes this a reply to a top-level comment.
 */
export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsMongoId()
  parentId?: string;
}

/** Public thread pagination (top-level comments; replies are nested per item). */
export class CommentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/** Moderation queue: filter by status (default 'pending'), page-based. */
export class ModerationQueryDto {
  @IsOptional()
  @IsIn(COMMENT_STATUSES)
  status?: CommentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/** The shape returned to clients — never a raw Mongoose document. */
export interface CommentView {
  id: string;
  articleId: string;
  authorId: string;
  authorName: string;
  body: string;
  status: CommentStatus;
  parentId?: string;
  createdAt: string;
  replies?: CommentView[]; // present on top-level comments in the public thread
}

/** A page of comments, page-based (public thread + moderation queue). */
export interface CommentPage {
  items: CommentView[];
  page: number;
  limit: number;
  total: number;
}

/** Reaction endpoints return only the fresh denormalized count. */
export interface LikeView {
  likeCount: number;
}
