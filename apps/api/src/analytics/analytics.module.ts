import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/**
 * Analytics — a read-only, tenant-scoped dashboard over data other modules
 * already collect (Article, Comment, Subscriber, Plan, Category). It registers NO
 * schemas of its own: those models are attached to every tenant connection by
 * their owning modules, and analytics reads them by name through MongoService.
 * Pure aggregation, no write path. See CLAUDE.md Phase 3.
 */
@Module({
  imports: [TenancyModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
