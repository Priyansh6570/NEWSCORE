import { Injectable, NotFoundException } from '@nestjs/common';
import { type FilterQuery, type Model, Types } from 'mongoose';
import { slugify, uniqueSlug } from '../common/slug';
import { MongoService } from '../database/mongo.service';
import { SubscriptionService } from '../monetisation/subscription.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ARTICLE_MODEL, type ArticleDoc } from './article.schema';
import {
  type ArticlePage,
  type ArticleView,
  type CreateArticleDto,
  type ArticleQueryDto,
  type UpdateArticleDto,
} from './dto/article.dto';

@Injectable()
export class ArticleService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  /** The Article model on the active tenant's connection. */
  private model(): Model<ArticleDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<ArticleDoc>(ARTICLE_MODEL);
  }

  // ── Commands ───────────────────────────────────────────────────────────

  /**
   * Create a draft. The slug is derived from the title and made unique within
   * the tenant by appending -2, -3… on collision. status is always 'draft' —
   * publishing is a separate, permission-gated step.
   */
  async create(dto: CreateArticleDto, authorId: string): Promise<ArticleView> {
    const slug = await uniqueSlug(this.model(), slugify(dto.title, 'article'));
    const doc = await this.model().create({
      title: dto.title,
      slug,
      excerpt: dto.excerpt,
      body: dto.body,
      status: 'draft',
      categoryId: dto.categoryId,
      tagIds: dto.tagIds ?? [],
      editionIds: dto.editionIds ?? [],
      authorId,
      coverMediaId: dto.coverMediaId,
      mediaIds: dto.mediaIds ?? [],
      isBreaking: dto.isBreaking ?? false,
      isFeatured: dto.isFeatured ?? false,
      isPremium: dto.isPremium ?? false,
      seo: dto.seo ?? {},
    });
    return toView(doc.toObject());
  }

  /** Patch editable fields. status is NOT settable here (see publish/archive). */
  async update(id: string, dto: UpdateArticleDto): Promise<ArticleView> {
    const updated = await this.model()
      .findByIdAndUpdate(this.objectId(id), { $set: dto }, { new: true })
      .lean<ArticleDoc>()
      .exec();
    if (!updated) throw new NotFoundException('Article not found');
    return toView(updated);
  }

  /** Move an article to 'published' and stamp publishedAt = now. */
  async publish(id: string): Promise<ArticleView> {
    const updated = await this.model()
      .findByIdAndUpdate(
        this.objectId(id),
        { $set: { status: 'published', publishedAt: new Date() } },
        { new: true },
      )
      .lean<ArticleDoc>()
      .exec();
    if (!updated) throw new NotFoundException('Article not found');
    return toView(updated);
  }

  /** Move an article to 'archived' (hidden from public feeds). */
  async archive(id: string): Promise<ArticleView> {
    const updated = await this.model()
      .findByIdAndUpdate(this.objectId(id), { $set: { status: 'archived' } }, { new: true })
      .lean<ArticleDoc>()
      .exec();
    if (!updated) throw new NotFoundException('Article not found');
    return toView(updated);
  }

  /** Hard-delete an article. */
  async remove(id: string): Promise<void> {
    const res = await this.model().deleteOne({ _id: this.objectId(id) }).exec();
    if (res.deletedCount === 0) throw new NotFoundException('Article not found');
  }

  // ── Queries ────────────────────────────────────────────────────────────

  /**
   * Public feed: published articles whose publishedAt has passed, newest first.
   * Supports category/tag/edition filters. Page-based.
   */
  async listPublished(q: ArticleQueryDto): Promise<ArticlePage> {
    const filter: FilterQuery<ArticleDoc> = {
      status: 'published',
      publishedAt: { $lte: new Date() },
    };
    if (q.categoryId) filter.categoryId = new Types.ObjectId(q.categoryId);
    if (q.tagId) filter.tagIds = new Types.ObjectId(q.tagId);
    if (q.editionId) filter.editionIds = new Types.ObjectId(q.editionId);
    // Public feed: a premium card carries its metadata + excerpt + isPremium badge
    // but NEVER the body — the list is ungated, so it must not leak premium bodies.
    return this.paginate(filter, q, { publishedAt: -1 }, publicListView);
  }

  /**
   * Public single read by slug — only a published, already-live article.
   * Atomically increments the view counter (always, even when paywalled); 404 if
   * none matches.
   *
   * Paywall (§13): a premium article's full body is served only to an active
   * subscriber. An anonymous reader or a logged-in non-subscriber gets the
   * PAYWALLED view — metadata + excerpt, isPremium/paywalled flags, body OMITTED.
   * A non-subscriber must NEVER receive the full premium body. `userId` is
   * undefined for anonymous requests (the route is @OptionalAuth).
   */
  async getPublishedBySlug(slug: string, userId?: string): Promise<ArticleView> {
    const updated = await this.model()
      .findOneAndUpdate(
        { slug, status: 'published', publishedAt: { $lte: new Date() } },
        { $inc: { views: 1 } },
        { new: true },
      )
      .lean<ArticleDoc>()
      .exec();
    if (!updated) throw new NotFoundException('Article not found');

    if (!updated.isPremium) return toView(updated);

    // Premium: full body only for an active subscriber; otherwise paywalled.
    const unlocked = userId ? await this.subscriptions.hasActiveSubscription(userId) : false;
    return unlocked ? toView(updated) : toPaywalledView(updated);
  }

  /** Admin listing: every status, newest first. Gated by article:viewAll. */
  async listAll(q: ArticleQueryDto): Promise<ArticlePage> {
    const filter: FilterQuery<ArticleDoc> = {};
    if (q.categoryId) filter.categoryId = new Types.ObjectId(q.categoryId);
    if (q.tagId) filter.tagIds = new Types.ObjectId(q.tagId);
    if (q.editionId) filter.editionIds = new Types.ObjectId(q.editionId);
    return this.paginate(filter, q, { createdAt: -1 });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Shared page-based query: count + sorted/skipped/limited fetch. `map` decides
   * how each doc is projected — admin listings use the full view; the public feed
   * paywalls premium cards (no body). Defaults to the full view.
   */
  private async paginate(
    filter: FilterQuery<ArticleDoc>,
    q: ArticleQueryDto,
    sort: Record<string, 1 | -1>,
    map: (doc: ArticleDoc) => ArticleView = toView,
  ): Promise<ArticlePage> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const model = this.model();
    const [docs, total] = await Promise.all([
      model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<ArticleDoc[]>()
        .exec(),
      model.countDocuments(filter).exec(),
    ]);
    return { items: docs.map(map), page, limit, total };
  }

  /** Parse an id param, returning a 404 (not a 500) on a malformed id. */
  private objectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Article not found');
    return new Types.ObjectId(id);
  }
}

/** Map a lean Article document to the public ArticleView. Never leak raw docs. */
function toView(doc: ArticleDoc): ArticleView {
  return {
    id: doc._id.toString(),
    title: doc.title,
    slug: doc.slug,
    excerpt: doc.excerpt,
    body: doc.body,
    status: doc.status,
    categoryId: doc.categoryId?.toString(),
    tagIds: (doc.tagIds ?? []).map((t) => t.toString()),
    editionIds: (doc.editionIds ?? []).map((e) => e.toString()),
    authorId: doc.authorId.toString(),
    coverMediaId: doc.coverMediaId?.toString(),
    mediaIds: (doc.mediaIds ?? []).map((m) => m.toString()),
    isBreaking: doc.isBreaking,
    isFeatured: doc.isFeatured,
    isPremium: doc.isPremium ?? false,
    seo: {
      title: doc.seo?.title,
      description: doc.seo?.description,
      ogImage: doc.seo?.ogImage,
    },
    scheduledAt: doc.scheduledAt?.toISOString(),
    publishedAt: doc.publishedAt?.toISOString(),
    views: doc.views,
    likeCount: doc.likeCount ?? 0,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * The paywalled view of a premium article: the full ArticleView minus the body
 * (the gated content), with paywalled:true. Built by stripping the body from the
 * normal view so it can never accidentally include it. See CLAUDE.md §13.
 */
function toPaywalledView(doc: ArticleDoc): ArticleView {
  return { ...toView(doc), body: null, paywalled: true };
}

/** Public-feed projection: premium cards are paywalled (no body), free ones full. */
function publicListView(doc: ArticleDoc): ArticleView {
  return doc.isPremium ? toPaywalledView(doc) : toView(doc);
}
