import { Schema, Types } from 'mongoose';

/** Mongoose model name for subscriber records (tenant DB). */
export const SUBSCRIBER_MODEL = 'Subscriber';

export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'cancelled';
export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'pending',
  'active',
  'expired',
  'cancelled',
];

/**
 * One purchase of a plan by a user. Created as 'pending' at checkout (carrying the
 * Razorpay order id) and only flipped to 'active' by the signature-verified
 * webhook once payment is captured — never by the client. `razorpayOrderId` is
 * unique so a webhook delivery maps to exactly one subscriber. `currentPeriodEnd`
 * is set on activation (now + the plan's interval). See CLAUDE.md §6.3.
 */
export interface SubscriberDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  status: SubscriptionStatus;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const SubscriberSchema = new Schema<SubscriberDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'pending' },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String },
    currentPeriodEnd: { type: Date },
  },
  { collection: 'subscribers', timestamps: true },
);

// "My subscription" lookups and the admin list filter.
SubscriberSchema.index({ userId: 1 });
SubscriberSchema.index({ status: 1 });
// One subscriber per Razorpay order — the structural guarantee the webhook relies on.
SubscriberSchema.index({ razorpayOrderId: 1 }, { unique: true });
