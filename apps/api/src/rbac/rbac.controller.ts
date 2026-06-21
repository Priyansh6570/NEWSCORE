import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { RequirePermissions } from './permissions.guard';
import { RbacService } from './rbac.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

/**
 * Admin-facing role management (CLAUDE.md §10). Everything here is gated on the
 * `role:manage` permission; the service additionally enforces that no actor can
 * grant a permission they don't hold, and that the locked Super Admin role is
 * never edited or deleted.
 */
@Controller()
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @RequirePermissions('role:manage') @Get('roles')
  list() {
    return this.rbac.list();
  }

  @RequirePermissions('role:manage') @Post('roles')
  create(@Body() dto: CreateRoleDto, @CurrentUser() actor: AuthUser) {
    return this.rbac.create(dto, actor.id); // actor from the token, never the body
  }

  @RequirePermissions('role:manage') @Patch('roles/:id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() actor: AuthUser) {
    return this.rbac.update(id, dto, actor.id);
  }

  @RequirePermissions('role:manage') @HttpCode(204) @Delete('roles/:id')
  remove(@Param('id') id: string) {
    return this.rbac.remove(id);
  }

  /** The assignable-permission catalog (grouped) for the admin UI. */
  @RequirePermissions('role:manage') @Get('permissions')
  permissions() {
    return this.rbac.permissionCatalog();
  }
}
