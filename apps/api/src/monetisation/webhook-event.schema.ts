import { Schema, Types } from 'mongoose';

/** Mongoose model name for processed webhook deliveries (tenant DB). */
export const WEBHOOK_EVENT_MODEL = 'WebhookEvent';

/**
 * A record that we have already processed a given Razorpay webhook delivery,
 * keyed by Razorpay's unique event id (the `x-razorpay-event-id` header). The
 * unique index makes idempotency structural: a redelivery of the same event
 * hits a duplicate-key error and is treated as a no-op, so a captured payment
 * can never activate a subscriber twice. See CLAUDE.md §13 (payments).
 */
export interface WebhookEventDoc {
  _id: Types.ObjectId;
  eventId: string; // Razorpay x-razorpay-event-id
  event: string; // e.g. 'payment.captured' — kept for audit/debugging
  createdAt: Date;
}

export const WebhookEventSchema = new Schema<WebhookEventDoc>(
  {
    eventId: { type: String, required: true },
    event: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'webhook_events' },
);

// The dedupe guarantee: one record per Razorpay event id.
WebhookEventSchema.index({ eventId: 1 }, { unique: true });
