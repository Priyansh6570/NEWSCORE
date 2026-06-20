import { Module } from '@nestjs/common';
import { TenantRegistryService } from './tenant-registry.service';

/**
 * Platform-level concerns: the tenant registry (and later, platform admins +
 * provisioning). Depends on the global DatabaseModule and RedisModule.
 */
@Module({
  providers: [TenantRegistryService],
  exports: [TenantRegistryService],
})
export class PlatformModule {}
