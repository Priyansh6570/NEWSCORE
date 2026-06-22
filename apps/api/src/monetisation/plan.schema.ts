import { Schema, Types } from 'mongoose';

/** Mongoose model name for subscription plans (tenant DB). */
export const PLAN_MODEL = 'Plan';

export type PlanInterval = 'month' | 'year';
export const PLAN_INTERVALS: readonly PlanInterval[] = ['month', 'year'];

/** The only currency we transact in for now — Razorpay accounts here are INR. */
export type PlanCurrency = 'INR';
export const PLAN_CURRENCIES: readonly PlanCurrency[] = ['INR'];

/**
 * A subscription plan a reader can buy. `amount` is ALWAYS in the smallest
 * currency unit (paise for INR) — the same unit Razorpay expects — so there is
 * never a rupee/paise ambiguity and the order amount is taken verbatim from here,
 * never from the client. `isActive` gates whether it shows on the pricing page.
 * See CLAUDE.md §6.3.
 */
export interface PlanDoc {
  _id: Types.ObjectId;
  name: string;
  amount: number; // paise
  currency: PlanCurrency;
  interval: PlanInterval;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const PlanSchema = new Schema<PlanDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Integer paise; min 100 (₹1) — Razorpay rejects orders below 100 paise.
    amount: { type: Number, required: true, min: 100 },
    currency: { type: String, enum: PLAN_CURRENCIES, default: 'INR' },
    interval: { type: String, enum: PLAN_INTERVALS, required: true },
    description: { type: String, trim: true, maxlength: 1000 },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'plans', timestamps: true },
);

// Pricing page read: active plans.
PlanSchema.index({ isActive: 1 });
