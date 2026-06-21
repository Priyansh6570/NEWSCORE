import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../rbac/permissions.guard';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';

/**
 * Admin-facing user management (CLAUDE.md §6.2, §10). Reads need `user:view`,
 * writes need `user:manage`. Assigning roleIds is role assignment — the service
 * escalation-checks it and refuses to demote the last Super Admin.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermissions('user:view') @Get()
  list(@Query() q: UserQueryDto) {
    return this.users.list(q);
  }

  @RequirePermissions('user:view') @Get(':id')
  getOne(@Param('id') id: string) {
    return this.users.getOne(id);
  }

  @RequirePermissions('user:manage') @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor.id); // actor from the token, never the body
  }

  @RequirePermissions('user:manage') @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor.id);
  }

  @RequirePermissions('user:manage') @HttpCode(200) @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.users.deactivate(id);
  }
}
