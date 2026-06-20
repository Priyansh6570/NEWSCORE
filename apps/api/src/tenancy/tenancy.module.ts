import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ClsMiddleware } from 'nestjs-cls';
import { PlatformModule } from '../platform/platform.module';
import { TenantMiddleware } from './tenant.middleware';
import { TenantClsMiddleware } from './tenant-cls.middleware';
import { TenantContextService } from './tenant-context.service';

/**
 * Resolves the tenant on every request and exposes it via CLS.
 *
 * Middleware order matters and is explicit here:
 *   1. ClsMiddleware       — establishes the AsyncLocalStorage store
 *   2. TenantMiddleware    — resolves tenant from host, sets req.tenant (404 if unknown)
 *   3. TenantClsMiddleware — copies req.tenant into CLS for services to read
 */
@Module({
  imports: [PlatformModule],
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ClsMiddleware, TenantMiddleware, TenantClsMiddleware)
      .forRoutes('*');
  }
}
