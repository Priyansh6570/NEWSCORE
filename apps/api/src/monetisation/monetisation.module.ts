import { Module, type OnModuleInit } from '@nestjs/common';
import { MongoService } from '../database/mongo.service';
import { SiteConfigModule } from '../site-config/site-config.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PLAN_MODEL, PlanSchema } from './plan.schema';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SUBSCRIBER_MODEL, SubscriberSchema } from './subscriber.schema';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WEBHOOK_EVENT_MODEL, WebhookEventSchema } from './webhook-event.schema';

/**
 * Monetisation (CLAUDE.md §13 payments path): subscription plans, Razorpay
 * checkout, subscriber records, and the signature-verified payment webhook.
 * Imports SiteConfigModule for the per-tenant decrypted Razorpay keys
 * (getDecryptedRazorpay) — secrets are never read from env or logged. Tenant-
 * scoped throughout; schemas are registered on every tenant connection.
 */
@Module({
  imports: [TenancyModule, SiteConfigModule],
  controllers: [PlanController, SubscriptionController, WebhookController],
  providers: [PlanService, SubscriptionService, WebhookService],
  exports: [PlanService, SubscriptionService],
})
export class MonetisationModule implements OnModuleInit {
  constructor(private readonly mongo: MongoService) {}

  onModuleInit(): void {
    this.mongo.registerTenantModel(PLAN_MODEL, PlanSchema);
    this.mongo.registerTenantModel(SUBSCRIBER_MODEL, SubscriberSchema);
    this.mongo.registerTenantModel(WEBHOOK_EVENT_MODEL, WebhookEventSchema);
  }
}
