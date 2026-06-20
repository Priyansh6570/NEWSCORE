import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Shape of our access-token payload. */
interface AccessTokenPayload {
  sub: string; // user id
  tid: string; // tenant id
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly ctx: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string; tenantId: string } }>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token); // throws → 401
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Cross-tenant defence: the token's tenant MUST match the host-resolved tenant.
    if (payload.tid !== this.ctx.tenantId) {
      throw new UnauthorizedException('Token does not belong to this tenant');
    }

    req.user = { id: payload.sub, tenantId: payload.tid };
    return true;
  }
}
