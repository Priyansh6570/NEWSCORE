import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type FilterQuery, type Model, Types } from 'mongoose';
import { MongoService } from '../database/mongo.service';
import { SiteConfigService } from '../site-config/site-config.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PLAN_MODEL, type PlanDoc } from './plan.schema';
import { SUBSCRIBER_MODEL, type SubscriberDoc } from './subscriber.schema';
import { createRazorpayOrder } from './razorpay.client';
import {
  type CheckoutView,
  type SubscriberPage,
  type SubscriberView,
  type SubscriptionView,
  type SubscribersQueryDto,
} from './dto/monetisation.dto';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
    private readonly siteConfig: SiteConfigService,
  ) {}

  private model(): Model<SubscriberDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<SubscriberDoc>(SUBSCRIBER_MODEL);
  }

  private planModel(): Model<PlanDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<PlanDoc>(PLAN_MODEL);
  }

  /**
   * Begin a purchase: create a Razorpay ORDER for the chosen plan using THIS
   * tenant's decrypted keys, and record a 'pending' subscriber against it. The
   * amount is taken from the plan (paise) — never from the client. The returned
   * payload is exactly what the client needs to open Razorpay checkout.
   */
  async checkout(planId: string, userId: string): Promise<CheckoutView> {
    const plan = await this.planModel()
      .findById(this.objectId(planId, 'Plan not found'))
      .lean<PlanDoc>()
      .exec();
    if (!plan || !plan.isActive) throw new NotFoundException('Plan not found');

    const creds = await this.siteConfig.getDecryptedRazorpay();
    if (!creds) throw new BadRequestException('Razorpay is not configured for this tenant');

    // Pre-mint the subscriber id so it doubles as the Razorpay receipt, tying the
    // order back to our record without a second write.
    const subscriberId = new Types.ObjectId();
    const order = await createRazorpayOrder(
      { keyId: creds.keyId, keySecret: creds.keySecret },
      {
        amount: plan.amount, // derived from the plan, never the client
        currency: plan.currency,
        receipt: subscriberId.toString(),
        notes: { planId: plan._id.toString(), userId },
      },
    );

    await this.model().create({
      _id: subscriberId,
      userId: new Types.ObjectId(userId),
      planId: plan._id,
      status: 'pending',
      razorpayOrderId: order.id,
    });

    return {
      orderId: order.id,
      amount: plan.amount,
      currency: plan.currency,
      keyId: creds.keyId, // public key id — safe to hand the client
    };
  }

  /** The caller's most recent subscription, or null if they have none. */
  async mine(userId: string): Promise<SubscriptionView | null> {
    const doc = await this.model()
      .findOne({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean<SubscriberDoc>()
      .exec();
    return doc ? toSubscriptionView(doc) : null;
  }

  /** Admin list, page-based, newest first, with an optional status filter. */
  async list(q: SubscribersQueryDto): Promise<SubscriberPage> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const filter: FilterQuery<SubscriberDoc> = {};
    if (q.status) filter.status = q.status;

    const model = this.model();
    const [docs, total] = await Promise.all([
      model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<SubscriberDoc[]>()
        .exec(),
      model.countDocuments(filter).exec(),
    ]);
    return { items: docs.map(toSubscriberView), page, limit, total };
  }

  private objectId(id: string, message: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException(message);
    return new Types.ObjectId(id);
  }
}

function toSubscriptionView(doc: SubscriberDoc): SubscriptionView {
  return {
    id: doc._id.toString(),
    planId: doc.planId.toString(),
    status: doc.status,
    currentPeriodEnd: doc.currentPeriodEnd?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

function toSubscriberView(doc: SubscriberDoc): SubscriberView {
  return {
    ...toSubscriptionView(doc),
    userId: doc.userId.toString(),
    razorpayOrderId: doc.razorpayOrderId,
    razorpayPaymentId: doc.razorpayPaymentId,
  };
}
