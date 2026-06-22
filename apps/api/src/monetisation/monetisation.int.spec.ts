import { createHmac } from 'node:crypto';
import { type Model, Types } from 'mongoose';
import type { SiteConfigService } from '../site-config/site-config.service';
import { startIntDb, TEST_DB_NAME, type IntDb } from '../test/int-db';
import { PLAN_MODEL, PlanSchema, type PlanDoc } from './plan.schema';
import { SUBSCRIBER_MODEL, SubscriberSchema, type SubscriberDoc } from './subscriber.schema';
import { WEBHOOK_EVENT_MODEL, WebhookEventSchema, type WebhookEventDoc } from './webhook-event.schema';
import { WebhookService } from './webhook.service';

/**
 * Real-Mongo integration specs for the two webhook invariants that make the
 * payments path safe (CLAUDE.md §13):
 *   1. a bad/forged signature is REJECTED before any state changes; and
 *   2. a duplicate event delivery never double-activates a subscriber (idempotency
 *      by Razorpay event id, plus the pending→active guard).
 * Driven against an actual MongoDB so the unique indexes behind both guarantees
 * are the real ones, not a mock that could agree with a bug.
 */
describe('Monetisation webhook (integration, real Mongo)', () => {
  const WEBHOOK_SECRET = 'whsec_test_abc123';
  let db: IntDb;
  let webhooks: WebhookService;

  // Stub SiteConfig: hand back fixed decrypted keys for the active tenant.
  const siteConfig = {
    getDecryptedRazorpay: async () => ({
      keyId: 'rzp_test_key',
      keySecret: 'rzp_test_secret',
      webhookSecret: WEBHOOK_SECRET,
    }),
  } as unknown as SiteConfigService;

  beforeAll(async () => {
    db = await startIntDb([
      [PLAN_MODEL, PlanSchema],
      [SUBSCRIBER_MODEL, SubscriberSchema],
      [WEBHOOK_EVENT_MODEL, WebhookEventSchema],
    ]);
    webhooks = new WebhookService(db.mongo, db.ctx, siteConfig);
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset(PLAN_MODEL);
    await db.reset(SUBSCRIBER_MODEL);
    await db.reset(WEBHOOK_EVENT_MODEL);
  });

  const planModel = (): Model<PlanDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<PlanDoc>(PLAN_MODEL);
  const subscriberModel = (): Model<SubscriberDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<SubscriberDoc>(SUBSCRIBER_MODEL);
  const eventModel = (): Model<WebhookEventDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<WebhookEventDoc>(WEBHOOK_EVENT_MODEL);

  const ORDER_ID = 'order_TEST123';

  async function seedPendingSubscriber(): Promise<SubscriberDoc> {
    const plan = await planModel().create({
      name: 'Monthly',
      amount: 49900,
      currency: 'INR',
      interval: 'month',
      isActive: true,
    });
    return subscriberModel().create({
      userId: new Types.ObjectId(),
      planId: plan._id,
      status: 'pending',
      razorpayOrderId: ORDER_ID,
    });
  }

  /** A payment.captured body for ORDER_ID, plus its valid signature over the bytes. */
  function capturedEvent(): { raw: Buffer; signature: string } {
    const body = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_TEST123', order_id: ORDER_ID } } },
    };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
    return { raw, signature };
  }

  // ── Invariant 1: forged signatures are rejected before any state change ──────

  it('rejects a bad signature with 400 and changes nothing', async () => {
    await seedPendingSubscriber();
    const { raw } = capturedEvent();

    await expect(webhooks.handle(raw, 'not-a-real-signature', 'evt_bad')).rejects.toThrow(
      'Invalid webhook signature',
    );

    // No event recorded, subscriber still pending — the forged call was inert.
    expect(await eventModel().countDocuments().exec()).toBe(0);
    const sub = await subscriberModel().findOne({ razorpayOrderId: ORDER_ID }).lean<SubscriberDoc>();
    expect(sub?.status).toBe('pending');
    expect(sub?.currentPeriodEnd).toBeUndefined();
  });

  // ── Invariant 2: duplicate delivery never double-activates ───────────────────

  it('activates once on a valid event; a duplicate event id is a no-op', async () => {
    await seedPendingSubscriber();
    const { raw, signature } = capturedEvent();

    // First delivery: activates the subscriber.
    const first = await webhooks.handle(raw, signature, 'evt_1');
    expect(first).toEqual({ received: true, activated: true });

    const activated = await subscriberModel()
      .findOne({ razorpayOrderId: ORDER_ID })
      .lean<SubscriberDoc>();
    expect(activated?.status).toBe('active');
    expect(activated?.razorpayPaymentId).toBe('pay_TEST123');
    expect(activated?.currentPeriodEnd).toBeInstanceOf(Date);
    const periodEnd = activated!.currentPeriodEnd!;

    // Same event id again: deduped, no work done.
    const second = await webhooks.handle(raw, signature, 'evt_1');
    expect(second).toEqual({ received: true, duplicate: true });

    // Only ONE event record, and the period was NOT extended.
    expect(await eventModel().countDocuments().exec()).toBe(1);
    const after = await subscriberModel()
      .findOne({ razorpayOrderId: ORDER_ID })
      .lean<SubscriberDoc>();
    expect(after?.currentPeriodEnd?.getTime()).toBe(periodEnd.getTime());
  });

  it('a fresh event id for an already-active subscriber still does not re-activate', async () => {
    await seedPendingSubscriber();
    const { raw, signature } = capturedEvent();

    await webhooks.handle(raw, signature, 'evt_1');
    const periodEnd = (
      await subscriberModel().findOne({ razorpayOrderId: ORDER_ID }).lean<SubscriberDoc>()
    )!.currentPeriodEnd!;

    // Distinct delivery id (passes dedupe) but the pending→active guard holds.
    const redeliver = await webhooks.handle(raw, signature, 'evt_2');
    expect(redeliver).toEqual({ received: true, activated: false });

    const after = await subscriberModel()
      .findOne({ razorpayOrderId: ORDER_ID })
      .lean<SubscriberDoc>();
    expect(after?.currentPeriodEnd?.getTime()).toBe(periodEnd.getTime());
  });
});
