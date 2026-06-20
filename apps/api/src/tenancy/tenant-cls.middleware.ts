import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { TENANT_CLS_KEY, type TenantContext } from './tenant-context';

/**
 * Bridges the tenant resolved by TenantMiddleware (on req.tenant) into CLS so
 * services can read it via TenantContextService. Runs after ClsMiddleware (which
 * establishes the ALS store) and after TenantMiddleware.
 */
@Injectable()
export class TenantClsMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const tenant = (req as Request & { tenant?: TenantContext }).tenant;
    if (tenant) {
      this.cls.set(TENANT_CLS_KEY, tenant);
    }
    next();
  }
}
