import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import type { ArticleView } from '../../content/dto/article.dto';
import type { CommentStatus } from '../../engagement/comment.schema';

// ── Query DTOs ─────────────────────────────────────────────────────────────────

/** top-articles: optional publishedAt window (days) and a capped limit. */
export class TopArticlesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) days?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number = 10;
}

export const TIMESERIES_METRICS = ['articles', 'subscribers', 'comments'] as const;
export type TimeseriesMetric = (typeof TIMESERIES_METRICS)[number];

export const TIMESERIES_PERIODS = ['day', 'month'] as const;
export type TimeseriesPeriod = (typeof TIMESERIES_PERIODS)[number];

/** timeseries: which metric, bucket size, and an optional explicit range. */
export class TimeseriesQueryDto {
  @IsOptional() @IsIn(TIMESERIES_METRICS) metric?: TimeseriesMetric = 'articles';

  @IsOptional() @IsIn(TIMESERIES_PERIODS) period?: TimeseriesPeriod = 'day';

  @IsOptional() @IsISO8601() from?: string;

  @IsOptional() @IsISO8601() to?: string;
}

// ── View shapes ────────────────────────────────────────────────────────────────

/** Comment counts keyed by the real status enum, plus a total. */
export type CommentBreakdown = Record<CommentStatus, number> & { total: number };

export interface AnalyticsSummary {
  publishedArticles: number;
  totalViews: number;
  totalLikes: number;
  comments: CommentBreakdown;
  activeSubscribers: number;
}

export interface CategoryStat {
  categoryId: string;
  name: string;
  articles: number;
  views: number;
}

export interface PlanSubscribersStat {
  planId: string;
  name: string;
  interval: string;
  amount: number; // paise
  activeSubscribers: number;
  grossValuePaise: number; // amount * activeSubscribers (face value)
}

/**
 * Active subscribers per plan. `totalGrossValuePaise` is the GROSS sum of
 * amount × active across plans at face value — NOT normalised MRR (monthly and
 * yearly plans are not converted to a common cadence).
 */
export interface SubscribersByPlan {
  plans: PlanSubscribersStat[];
  totalActiveSubscribers: number;
  totalGrossValuePaise: number;
}

export interface TimeseriesBucket {
  date: string; // ISO start of the bucket (day/month, UTC)
  count: number;
}

export interface TimeseriesResult {
  metric: TimeseriesMetric;
  period: TimeseriesPeriod;
  from: string;
  to: string;
  buckets: TimeseriesBucket[];
}

/** top-articles returns body-free article cards (never the body). */
export type ArticleCardView = ArticleView;
