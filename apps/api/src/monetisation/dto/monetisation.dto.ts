import { Type } from 'class-transformer';
import {
  IsBoolean,
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
import {
  PLAN_CURRENCIES,
  PLAN_INTERVALS,
  type PlanCurrency,
  type PlanInterval,
} from '../plan.schema';
import {
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
} from '../subscriber.schema';

// ── Plans ────────────────────────────────────────────────────────────────────

/**
 * Create a plan. `amount` is in paise (integer, ≥100) — the smallest currency
 * unit Razorpay expects; the order amount is always derived from this, never the
 * client. currency defaults to INR.
 */
export class CreatePlanDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;

  @Type(() => Number) @IsInt() @Min(100) amount!: number;

  @IsOptional() @IsIn(PLAN_CURRENCIES) currency?: PlanCurrency;

  @IsIn(PLAN_INTERVALS) interval!: PlanInterval;

  @IsOptional() @IsString() @MaxLength(1000) description?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Patch a plan — every field optional. */
export class UpdatePlanDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) amount?: number;
  @IsOptional() @IsIn(PLAN_CURRENCIES) currency?: PlanCurrency;
  @IsOptional() @IsIn(PLAN_INTERVALS) interval?: PlanInterval;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Subscriptions ──────────────────────────────────────────────────────────────

/** Start checkout for a plan. The amount is NEVER accepted from the client. */
export class CheckoutDto {
  @IsMongoId() planId!: string;
}

/** Admin subscriber listing, page-based with an optional status filter. */
export class SubscribersQueryDto {
  @IsOptional() @IsIn(SUBSCRIPTION_STATUSES) status?: SubscriptionStatus;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}

// ── View shapes (never raw Mongoose documents) ────────────────────────────────

export interface PlanView {
  id: string;
  name: string;
  amount: number; // paise
  currency: PlanCurrency;
  interval: PlanInterval;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What the client needs to open the Razorpay checkout for a new order. */
export interface CheckoutView {
  orderId: string;
  amount: number; // paise — echoes the plan amount
  currency: string;
  keyId: string; // the tenant's PUBLIC Razorpay key id (safe to expose)
}

export interface SubscriptionView {
  id: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodEnd?: string;
  createdAt: string;
}

/** Admin view of a subscriber — carries the user id and Razorpay references. */
export interface SubscriberView extends SubscriptionView {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
}

export interface SubscriberPage {
  items: SubscriberView[];
  page: number;
  limit: number;
  total: number;
}
