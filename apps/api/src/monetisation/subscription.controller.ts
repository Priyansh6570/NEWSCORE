import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../rbac/permissions.guard';
import { SubscriptionService } from './subscription.service';
import { CheckoutDto, SubscribersQueryDto } from './dto/monetisation.dto';

@Controller()
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  // ── Authenticated reader: start checkout for a plan. A token IS required (no
  //    @Public); no permission needed (PermissionsGuard passes with none). The
  //    buyer is the principal — userId comes from the token, never the body. ──
  @Post('subscriptions/checkout')
  checkout(@Body() dto: CheckoutDto, @CurrentUser() user: AuthUser) {
    return this.subscriptions.checkout(dto.planId, user.id);
  }

  // ── Authenticated reader: my current subscription status ──
  @Get('subscriptions/me')
  mine(@CurrentUser() user: AuthUser) {
    return this.subscriptions.mine(user.id);
  }

  // ── Admin: subscriber list, gated on subscriber:manage ──
  @RequirePermissions('subscriber:manage') @HttpCode(200) @Get('subscribers')
  list(@Query() q: SubscribersQueryDto) {
    return this.subscriptions.list(q);
  }
}
