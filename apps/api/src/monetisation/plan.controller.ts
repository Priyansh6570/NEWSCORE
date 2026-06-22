import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../rbac/permissions.guard';
import { PlanService } from './plan.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/monetisation.dto';

@Controller('plans')
export class PlanController {
  constructor(private readonly plans: PlanService) {}

  // ── Public: the pricing page. Active plans only. ──
  @Public() @Get()
  list() {
    return this.plans.listActive();
  }

  // ── Admin: gated on plan:manage (a permission, never a role) ──
  @RequirePermissions('plan:manage') @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @RequirePermissions('plan:manage') @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }

  @RequirePermissions('plan:manage') @HttpCode(204) @Delete(':id')
  remove(@Param('id') id: string) {
    return this.plans.remove(id);
  }
}
