import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type FilterQuery, type Model, Types } from 'mongoose';
import { ARTICLE_MODEL, type ArticleDoc } from '../content/article.schema';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { USER_MODEL, type UserDoc } from '../users/user.schema';
import { COMMENT_MODEL, type CommentDoc, type CommentStatus } from './comment.schema';
import {
  type CommentPage,
  type CommentQueryDto,
  type CommentView,
  type CreateCommentDto,
  type ModerationQueryDto,
} from './dto/engagement.dto';

@Injectable()
export class CommentService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  /** The Comment model on the active tenant's connection. */
  private model(): Model<CommentDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<CommentDoc>(COMMENT_MODEL);
  }

  private articleModel(): Model<ArticleDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<ArticleDoc>(ARTICLE_MODEL);
  }

  private userModel(): Model<UserDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<UserDoc>(USER_MODEL);
  }

  // ── Commands ───────────────────────────────────────────────────────────

  /**
   * Post a comment as the authenticated reader. The article must exist in this
   * tenant; a reply's parent must be a top-level comment on the same article.
   * Always lands as 'pending' — pre-moderation keeps unapproved content out of
   * the public read. authorId/authorName come from the principal, never the body.
   */
  async create(articleId: string, dto: CreateCommentDto, authorId: string): Promise<CommentView> {
    const article = this.objectId(articleId, 'Article not found');
    await this.assertArticleExists(article);

    const author = await this.userModel().findById(authorId).lean<UserDoc>().exec();
    if (!author) throw new ForbiddenException('Unknown author');

    let parentId: Types.ObjectId | undefined;
    if (dto.parentId) {
      parentId = this.objectId(dto.parentId, 'Parent comment not found');
      const parent = await this.model().findById(parentId).lean<CommentDoc>().exec();
      if (!parent || !parent.articleId.equals(article)) {
        throw new NotFoundException('Parent comment not found');
      }
      // One level of replies only — a reply cannot itself be replied to.
      if (parent.parentId) throw new BadRequestException('Cannot reply to a reply');
    }

    const doc = await this.model().create({
      articleId: article,
      authorId: author._id,
      authorName: author.name,
      body: dto.body,
      status: 'pending',
      parentId,
    });
    return toView(doc.toObject());
  }

  /** Approve a comment so it becomes publicly visible. */
  async approve(id: string): Promise<CommentView> {
    return this.setStatus(id, 'approved');
  }

  /** Reject a comment — it stays out of the public read. */
  async reject(id: string): Promise<CommentView> {
    return this.setStatus(id, 'rejected');
  }

  /** Hard-delete a comment (moderation). */
  async remove(id: string): Promise<void> {
    const res = await this.model()
      .deleteOne({ _id: this.objectId(id, 'Comment not found') })
      .exec();
    if (res.deletedCount === 0) throw new NotFoundException('Comment not found');
  }

  // ── Queries ────────────────────────────────────────────────────────────

  /**
   * Public thread for an article: ONLY approved comments, top-level newest-first
   * with their approved replies nested (oldest-first). Pending/rejected comments
   * never appear here — the core visibility invariant. Page-based on top-level.
   */
  async listPublic(articleId: string, q: CommentQueryDto): Promise<CommentPage> {
    const article = this.objectId(articleId, 'Article not found');
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const model = this.model();

    const topFilter: FilterQuery<CommentDoc> = {
      articleId: article,
      status: 'approved',
      parentId: null, // matches missing-or-null → top-level only
    };
    const [tops, total] = await Promise.all([
      model
        .find(topFilter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<CommentDoc[]>()
        .exec(),
      model.countDocuments(topFilter).exec(),
    ]);

    const replies = tops.length
      ? await model
          .find({
            articleId: article,
            status: 'approved',
            parentId: { $in: tops.map((t) => t._id) },
          })
          .sort({ createdAt: 1 })
          .lean<CommentDoc[]>()
          .exec()
      : [];

    const repliesByParent = new Map<string, CommentView[]>();
    for (const r of replies) {
      const key = r.parentId!.toString();
      const list = repliesByParent.get(key) ?? [];
      list.push(toView(r));
      repliesByParent.set(key, list);
    }

    const items = tops.map((t) => ({
      ...toView(t),
      replies: repliesByParent.get(t._id.toString()) ?? [],
    }));
    return { items, page, limit, total };
  }

  /** Moderation queue: comments by status (default 'pending'), newest first. */
  async moderationQueue(q: ModerationQueryDto): Promise<CommentPage> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const filter: FilterQuery<CommentDoc> = { status: q.status ?? 'pending' };
    const model = this.model();
    const [docs, total] = await Promise.all([
      model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<CommentDoc[]>()
        .exec(),
      model.countDocuments(filter).exec(),
    ]);
    return { items: docs.map(toView), page, limit, total };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async setStatus(id: string, status: CommentStatus): Promise<CommentView> {
    const updated = await this.model()
      .findByIdAndUpdate(this.objectId(id, 'Comment not found'), { $set: { status } }, { new: true })
      .lean<CommentDoc>()
      .exec();
    if (!updated) throw new NotFoundException('Comment not found');
    return toView(updated);
  }

  private async assertArticleExists(articleId: Types.ObjectId): Promise<void> {
    const exists = await this.articleModel().exists({ _id: articleId });
    if (!exists) throw new NotFoundException('Article not found');
  }

  /** Parse an id param, returning a 404 (not a 500) on a malformed id. */
  private objectId(id: string, message: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException(message);
    return new Types.ObjectId(id);
  }
}

/** Map a lean Comment document to the CommentView. Never leak raw docs. */
function toView(doc: CommentDoc): CommentView {
  return {
    id: doc._id.toString(),
    articleId: doc.articleId.toString(),
    authorId: doc.authorId.toString(),
    authorName: doc.authorName,
    body: doc.body, // PLAIN TEXT — the client must escape, never render as HTML
    status: doc.status,
    parentId: doc.parentId?.toString(),
    createdAt: doc.createdAt.toISOString(),
  };
}
