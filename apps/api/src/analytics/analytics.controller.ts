import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../rbac/permissions.guard';
import { AnalyticsService } from './analytics.service';
import { TimeseriesQueryDto, TopArticlesQueryDto } from './dto/analytics.dto';

/**
 * Read-only admin dashboard over data we already collect (CLAUDE.md Phase 3).
 * Every endpoint is gated on analytics:view and tenant-scoped — no other
 * permission, no write path.
 */
@RequirePermissions('analytics:view')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary() {
    return this.analytics.summary();
  }

  @Get('top-articles')
  topArticles(@Query() q: TopArticlesQueryDto) {
    return this.analytics.topArticles(q);
  }

  @Get('by-category')
  byCategory() {
    return this.analytics.byCategory();
  }

  @Get('subscribers-by-plan')
  subscribersByPlan() {
    return this.analytics.subscribersByPlan();
  }

  @Get('timeseries')
  timeseries(@Query() q: TimeseriesQueryDto) {
    return this.analytics.timeseries(q);
  }
}
