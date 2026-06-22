import { Module } from '@nestjs/common';
import { SiteConfigModule } from '../site-config/site-config.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { NotificationsService } from './notifications.service';

/**
 * Notifications (CLAUDE.md §4, §12). Per-tenant SMS OTP delivery via MSG91 with a
 * dev console fallback. Imports SiteConfigModule for the per-tenant decrypted SMS
 * config (getDecryptedSms). No Redis (OTP storage stays in Auth) and no cycle:
 * SiteConfig/Tenancy do not depend on Auth.
 */
@Module({
  imports: [SiteConfigModule, TenancyModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
