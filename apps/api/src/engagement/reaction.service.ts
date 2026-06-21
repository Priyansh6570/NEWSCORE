import { Injectable, NotFoundException } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { ARTICLE_MODEL, type ArticleDoc } from '../content/article.schema';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { REACTION_MODEL, type ReactionDoc } from './reaction.schema';
import { type LikeView } from './dto/engagement.dto';

@Injectable()
export class ReactionService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  private model(): Model<ReactionDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<ReactionDoc>(REACTION_MODEL);
  }

  private articleModel(): Model<ArticleDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<ArticleDoc>(ARTICLE_MODEL);
  }

  /**
   * Like an article. Idempotent: a second like by the same user is a no-op. The
   * denormalized Article.likeCount is incremented ONLY when a new reaction record
   * is actually inserted (the unique (articleId,userId) index is the guarantee).
   */
  async like(articleId: string, userId: string): Promise<LikeView> {
    const article = this.objectId(articleId);
    await this.assertArticleExists(article);
    const user = new Types.ObjectId(userId);

    const res = await this.model()
      .updateOne(
        { articleId: article, userId: user },
        { $setOnInsert: { articleId: article, userId: user, createdAt: new Date() } },
        { upsert: true },
      )
      .exec();

    // upsertedCount === 1 ⇒ a brand-new like; otherwise it already existed (no-op).
    if (res.upsertedCount === 1) {
      await this.articleModel()
        .updateOne({ _id: article }, { $inc: { likeCount: 1 } })
        .exec();
    }
    return this.currentCount(article);
  }

  /**
   * Unlike an article. Decrements likeCount only when a record is actually
   * removed, and never below 0 (the `likeCount > 0` guard on the update).
   */
  async unlike(articleId: string, userId: string): Promise<LikeView> {
    const article = this.objectId(articleId);
    await this.assertArticleExists(article);

    const res = await this.model()
      .deleteOne({ articleId: article, userId: new Types.ObjectId(userId) })
      .exec();

    if (res.deletedCount === 1) {
      await this.articleModel()
        .updateOne({ _id: article, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } })
        .exec();
    }
    return this.currentCount(article);
  }

  /** Read the fresh denormalized count off the article. */
  private async currentCount(articleId: Types.ObjectId): Promise<LikeView> {
    const article = await this.articleModel()
      .findById(articleId)
      .select('likeCount')
      .lean<{ likeCount?: number }>()
      .exec();
    return { likeCount: article?.likeCount ?? 0 };
  }

  private async assertArticleExists(articleId: Types.ObjectId): Promise<void> {
    const exists = await this.articleModel().exists({ _id: articleId });
    if (!exists) throw new NotFoundException('Article not found');
  }

  private objectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Article not found');
    return new Types.ObjectId(id);
  }
}
