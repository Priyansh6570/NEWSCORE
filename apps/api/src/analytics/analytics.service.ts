import { Injectable } from '@nestjs/common';
import type { Model, PipelineStage } from 'mongoose';
import { ARTICLE_MODEL, type ArticleDoc } from '../content/article.schema';
import { toArticleCardView } from '../content/article.service';
import { MongoService } from '../database/mongo.service';
import {
  COMMENT_MODEL,
  COMMENT_STATUSES,
  type CommentDoc,
} from '../engagement/comment.schema';
import { PLAN_MODEL, type PlanDoc } from '../monetisation/plan.schema';
import { SUBSCRIBER_MODEL, type SubscriberDoc } from '../monetisation/subscriber.schema';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  type AnalyticsSummary,
  type ArticleCardView,
  type CategoryStat,
  type CommentBreakdown,
  type SubscribersByPlan,
  type TimeseriesQueryDto,
  type TimeseriesResult,
  type TopArticlesQueryDto,
} from './dto/analytics.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  // Every model is resolved on the ACTIVE tenant's connection — no pipeline ever
  // counts another tenant's documents (CLAUDE.md §5, the cardinal rule here).
  private model<T>(name: string): Model<T> {
    return this.mongo.tenant(this.ctx.dbName).model<T>(name);
  }

  // ── /analytics/summary ──────────────────────────────────────────────────────

  async summary(): Promise<AnalyticsSummary> {
    const now = new Date();
    const Article = this.model<ArticleDoc>(ARTICLE_MODEL);
    const Comment = this.model<CommentDoc>(COMMENT_MODEL);
    const Subscriber = this.model<SubscriberDoc>(SUBSCRIBER_MODEL);

    const [articleAgg, commentRows, activeSubscribers] = await Promise.all([
      Article.aggregate<{ publishedArticles: number; totalViews: number; totalLikes: number }>([
        { $match: { status: 'published' } },
        {
          $group: {
            _id: null,
            publishedArticles: { $sum: 1 },
            totalViews: { $sum: '$views' },
            totalLikes: { $sum: '$likeCount' },
          },
        },
      ]),
      Comment.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Subscriber.countDocuments({ status: 'active', currentPeriodEnd: { $gt: now } }),
    ]);

    const a = articleAgg[0];
    const comments = Object.fromEntries(COMMENT_STATUSES.map((s) => [s, 0])) as CommentBreakdown;
    comments.total = 0;
    for (const row of commentRows) {
      if ((COMMENT_STATUSES as readonly string[]).includes(row._id)) {
        comments[row._id as keyof CommentBreakdown] = row.count;
      }
      comments.total += row.count;
    }

    return {
      publishedArticles: a?.publishedArticles ?? 0,
      totalViews: a?.totalViews ?? 0,
      totalLikes: a?.totalLikes ?? 0,
      comments,
      activeSubscribers,
    };
  }

  // ── /analytics/top-articles ─────────────────────────────────────────────────

  async topArticles(q: TopArticlesQueryDto): Promise<ArticleCardView[]> {
    const now = new Date();
    const limit = Math.min(q.limit ?? 10, 50);

    const match: Record<string, unknown> = { status: 'published', publishedAt: { $lte: now } };
    if (q.days) {
      match.publishedAt = { $gte: new Date(now.getTime() - q.days * DAY_MS), $lte: now };
    }

    const docs = await this.model<ArticleDoc>(ARTICLE_MODEL)
      .find(match)
      .sort({ views: -1 })
      .limit(limit)
      .select('-body') // body never loaded, never returned (defence in depth)
      .lean<ArticleDoc[]>()
      .exec();

    // toArticleCardView strips body regardless, so a premium body cannot leak.
    return docs.map(toArticleCardView);
  }

  // ── /analytics/by-category ──────────────────────────────────────────────────

  async byCategory(): Promise<CategoryStat[]> {
    const rows = await this.model<ArticleDoc>(ARTICLE_MODEL).aggregate<{
      categoryId: unknown;
      name?: string;
      articles: number;
      views: number;
    }>([
      { $match: { status: 'published', categoryId: { $ne: null } } },
      { $group: { _id: '$categoryId', articles: { $sum: 1 }, views: { $sum: '$views' } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'cat' } },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, categoryId: '$_id', name: '$cat.name', articles: 1, views: 1 } },
      { $sort: { views: -1 } },
    ]);

    return rows.map((r) => ({
      categoryId: String(r.categoryId),
      name: r.name ?? '(unknown)',
      articles: r.articles,
      views: r.views,
    }));
  }

  // ── /analytics/subscribers-by-plan ──────────────────────────────────────────

  async subscribersByPlan(): Promise<SubscribersByPlan> {
    const now = new Date();
    const Plan = this.model<PlanDoc>(PLAN_MODEL);
    const Subscriber = this.model<SubscriberDoc>(SUBSCRIBER_MODEL);

    const [plans, activeRows] = await Promise.all([
      Plan.find().lean<PlanDoc[]>().exec(),
      Subscriber.aggregate<{ _id: unknown; count: number }>([
        { $match: { status: 'active', currentPeriodEnd: { $gt: now } } },
        { $group: { _id: '$planId', count: { $sum: 1 } } },
      ]),
    ]);

    const countByPlan = new Map(activeRows.map((r) => [String(r._id), r.count]));

    const planStats = plans
      .map((p) => {
        const active = countByPlan.get(String(p._id)) ?? 0;
        return {
          planId: String(p._id),
          name: p.name,
          interval: p.interval,
          amount: p.amount,
          activeSubscribers: active,
          grossValuePaise: p.amount * active,
        };
      })
      .sort((x, y) => y.activeSubscribers - x.activeSubscribers);

    // Head count spans ALL active subscribers (including any whose plan was since
    // deleted); gross value can only sum subscribers whose plan still exists (an
    // orphaned-plan subscriber has no known amount, so it's headcount-only).
    const totalActiveSubscribers = activeRows.reduce((sum, r) => sum + r.count, 0);
    const totalGrossValuePaise = planStats.reduce((sum, p) => sum + p.grossValuePaise, 0);

    return { plans: planStats, totalActiveSubscribers, totalGrossValuePaise };
  }

  // ── /analytics/timeseries ───────────────────────────────────────────────────

  async timeseries(q: TimeseriesQueryDto): Promise<TimeseriesResult> {
    const metric = q.metric ?? 'articles';
    const period = q.period ?? 'day';

    // Default window: last 30 days for day buckets, last 12 months for month.
    const to = q.to ? new Date(q.to) : new Date();
    let from: Date;
    if (q.from) {
      from = new Date(q.from);
    } else if (period === 'day') {
      from = new Date(to.getTime() - 30 * DAY_MS);
    } else {
      from = new Date(to);
      from.setMonth(from.getMonth() - 12);
    }

    // Each metric buckets on its own timestamped field. Subscribers exclude
    // 'pending' rows — those are abandoned/unpaid checkouts, never real
    // subscriptions (consistent with summary/subscribersByPlan, which only ever
    // count paid subscriptions).
    const config = {
      articles: { model: ARTICLE_MODEL, field: 'publishedAt', match: { status: 'published' } },
      subscribers: { model: SUBSCRIBER_MODEL, field: 'createdAt', match: { status: { $ne: 'pending' } } },
      comments: { model: COMMENT_MODEL, field: 'createdAt', match: {} },
    }[metric];

    const pipeline: PipelineStage[] = [
      { $match: { ...config.match, [config.field]: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateTrunc: { date: `$${config.field}`, unit: period } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const rows = await this.model(config.model).aggregate<{ _id: Date; count: number }>(pipeline);

    return {
      metric,
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      buckets: rows.map((r) => ({ date: new Date(r._id).toISOString(), count: r.count })),
    };
  }
}
