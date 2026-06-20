import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { USER_MODEL, type UserDoc } from '../users/user.schema';
import { ROLE_MODEL, type RoleDoc } from './role.schema';
import { SUPER_ADMIN_ROLE_NAME, type Permission } from './permissions';

export const PERMISSIONS_KEY = 'required_permissions';

/** Gate a handler/controller behind one or more permissions (never role names). */
export const RequirePermissions = (...perms: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  async canActivate(c: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      c.getHandler(),
      c.getClass(),
    ]);
    if (!required?.length) return true;

    const req = c.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    const db = this.mongo.tenant(this.ctx.dbName);
    const user = await db.model<UserDoc>(USER_MODEL).findById(userId).lean<UserDoc>();
    if (!user) throw new UnauthorizedException();
    const roles = await db
      .model<RoleDoc>(ROLE_MODEL)
      .find({ _id: { $in: user.roleIds } })
      .lean<RoleDoc[]>();

    // Super Admin (system, locked) bypasses individual permission checks.
    if (roles.some((r) => r.isSystem && r.name === SUPER_ADMIN_ROLE_NAME)) return true;

    const granted = new Set<Permission>(roles.flatMap((r) => r.permissions));
    if (!required.every((p) => granted.has(p))) {
      throw new ForbiddenException('Missing required permission');
    }
    return true;
  }
}
