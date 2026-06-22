import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { type Model } from 'mongoose';
import { MongoService } from '../database/mongo.service';
import { SiteConfigService } from '../site-config/site-config.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PLAN_MODEL, type PlanDoc } from './plan.schema';
import { SUBSCRIBER_MODEL, type SubscriberDoc } from './subscriber.schema';
import { WEBHOOK_EVENT_MODEL, type WebhookEventDoc } from './webhook-event.schema';
import { periodEnd } from './period';
import { verifyRazorpaySignature } from './razorpay.client';

/** The slices of a Razorpay webhook body we read AFTER signature verification. */
interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    order?: { entity?: { id?: string } };
  };
}

/** Events that mean "money received for this order" → activate the subscriber. */
const ACTIVATING_EVENTS = new Set(['payment.captured', 'order.paid']);

export interface WebhookResult {
  received: true;
  duplicate?: boolean;
  activated?: boolean;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
    private readonly siteConfig: SiteConfigService,
  ) {}

  private subscriberModel(): Model<SubscriberDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<SubscriberDoc>(SUBSCRIBER_MODEL);
  }

  private planModel(): Model<PlanDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<PlanDoc>(PLAN_MODEL);
  }

  private eventModel(): Model<WebhookEventDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<WebhookEventDoc>(WEBHOOK_EVENT_MODEL);
  }

  /**
   * Process a Razorpay webhook for the host-resolved tenant. Order of operations
   * is security-critical (CLAUDE.md §13):
   *   1. VERIFY the HMAC-SHA256 signature over the RAW bytes with THIS tenant's
   *      webhook secret — before reading the payload. Bad/missing signature → 400.
   *   2. DEDUPE by Razorpay's event id (unique-indexed); a redelivery is a no-op.
   *   3. On a payment-captured/order-paid event, activate the matching subscriber,
   *      transitioning pending → active exactly once (a guarded update), so a
   *      replay can never extend the billing period twice.
   */
  async handle(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    eventId: string | undefined,
  ): Promise<WebhookResult> {
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing webhook body');
    }

    // The secret is per-tenant (decrypted from SiteConfig). Without it we cannot
    // verify, so we reject rather than trust the payload.
    const creds = await this.siteConfig.getDecryptedRazorpay();
    if (!creds) throw new BadRequestException('Razorpay is not configured for this tenant');

    if (!verifyRazorpaySignature(rawBody, signature, creds.webhookSecret)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // Razorpay's unique delivery id is the idempotency key.
    if (!eventId) throw new BadRequestException('Missing webhook event id');

    // Safe to parse now — bytes are authenticated.
    let body: RazorpayWebhookBody;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookBody;
    } catch {
      throw new BadRequestException('Malformed webhook body');
    }
    const event = body.event ?? 'unknown';

    // Idempotency: claim this event id. A duplicate delivery loses the race and
    // short-circuits before doing any work.
    try {
      await this.eventModel().create({ eventId, event });
    } catch (err) {
      if (isDuplicateKey(err)) {
        this.logger.debug(`webhook ${eventId} already processed — no-op`);
        return { received: true, duplicate: true };
      }
      throw err;
    }

    // From here the event id is claimed; if processing fails, release the claim so
    // Razorpay's redelivery can reprocess rather than being treated as a duplicate.
    try {
      let activated = false;
      if (ACTIVATING_EVENTS.has(event)) {
        const ref = orderRef(body);
        if (ref.orderId) activated = await this.activate(ref.orderId, ref.paymentId);
      }
      return { received: true, activated };
    } catch (err) {
      // Release the claim so Razorpay's redelivery can reprocess. If THIS fails
      // too, the event id stays claimed and a redelivery would be wrongly deduped
      // (captured payment, never activated) — make that loud, never silent.
      await this.eventModel()
        .deleteOne({ eventId })
        .exec()
        .catch((releaseErr: unknown) =>
          this.logger.error(
            `failed to release webhook claim ${eventId} after a processing error; ` +
              `a redelivery may be wrongly deduped`,
            releaseErr instanceof Error ? releaseErr.stack : String(releaseErr),
          ),
        );
      throw err;
    }
  }

  /**
   * Activate the subscriber for an order. The update is guarded on
   * status:'pending', so it fires at most once — a second (duplicate or
   * concurrent) delivery matches nothing and never recomputes currentPeriodEnd.
   * Returns true only when this call performed the transition.
   */
  private async activate(orderId: string, paymentId?: string): Promise<boolean> {
    const sub = await this.subscriberModel()
      .findOne({ razorpayOrderId: orderId })
      .lean<SubscriberDoc>()
      .exec();
    if (!sub) {
      // An order we never created (or another tenant's) — ignore quietly.
      this.logger.warn(`webhook order ${orderId} has no matching subscriber`);
      return false;
    }
    if (sub.status === 'active') return false; // already activated — no-op

    const plan = await this.planModel().findById(sub.planId).lean<PlanDoc>().exec();
    if (!plan) throw new BadRequestException('Subscriber references a missing plan');

    const res = await this.subscriberModel()
      .updateOne(
        { _id: sub._id, status: 'pending' },
        {
          $set: {
            status: 'active',
            currentPeriodEnd: periodEnd(new Date(), plan.interval),
            ...(paymentId ? { razorpayPaymentId: paymentId } : {}),
          },
        },
      )
      .exec();
    return res.modifiedCount === 1;
  }
}

/** Pull the order id (and payment id, when present) out of a verified payload. */
function orderRef(body: RazorpayWebhookBody): { orderId?: string; paymentId?: string } {
  const payment = body.payload?.payment?.entity;
  const order = body.payload?.order?.entity;
  return {
    orderId: payment?.order_id ?? order?.id,
    paymentId: payment?.id,
  };
}

/** A MongoDB duplicate-key error (unique index violation). */
function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}
