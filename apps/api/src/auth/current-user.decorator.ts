import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** The authenticated principal attached by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  tenantId: string;
}

/** Inject the authenticated user (set by JwtAuthGuard) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user) {
      // Should never happen on a guarded route; defensive for misconfiguration.
      throw new Error('CurrentUser used on a route without JwtAuthGuard');
    }
    return req.user;
  },
);
