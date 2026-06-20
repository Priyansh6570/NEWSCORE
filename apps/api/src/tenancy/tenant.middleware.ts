import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { TenantRegistryService } from '../platform/tenant-registry.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly registry: TenantRegistryService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // split(...)[0] is always defined; `?? ''` only satisfies noUncheckedIndexedAccess.
    const host = (
      String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0] ?? ''
    )
      .trim()
      .split(':')[0]
      ?.toLowerCase() ?? '';
    const tenant = await this.registry.resolveByHost(host);
    if (!tenant || tenant.status !== 'active') {
      throw new NotFoundException('Unknown or inactive tenant');
    }
    (req as Request & { tenant?: unknown }).tenant = {
      id: tenant.id,
      slug: tenant.slug,
      dbName: tenant.dbName,
    };
    next();
  }
}
