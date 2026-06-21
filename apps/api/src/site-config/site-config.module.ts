import { Module, type OnModuleInit } from '@nestjs/common';
import { MongoService } from '../database/mongo.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { FeatureGuard } from './feature.guard';
import { SiteConfigController } from './site-config.controller';
import { SiteConfigService } from './site-config.service';
import { SITE_CONFIG_MODEL, SiteConfigSchema } from './site-config.schema';

/**
 * White-label core (CLAUDE.md §7–§9): per-tenant branding, theme tokens, page
 * layouts, feature flags, and encrypted integration secrets. EncryptionService
 * and RedisService come from their global modules. SiteConfigService is exported
 * so the payments module can later read decrypted keys internally.
 */
@Module({
  imports: [TenancyModule],
  controllers: [SiteConfigController],
  providers: [SiteConfigService, FeatureGuard],
  exports: [SiteConfigService, FeatureGuard],
})
export class SiteConfigModule implements OnModuleInit {
  constructor(private readonly mongo: MongoService) {}

  onModuleInit(): void {
    this.mongo.registerTenantModel(SITE_CONFIG_MODEL, SiteConfigSchema);
  }
}
