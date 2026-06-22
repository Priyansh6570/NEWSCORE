import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { SiteConfigService } from '../site-config/site-config.service';
import { ConsoleSmsProvider, Msg91SmsProvider, type SmsProvider } from './sms.provider';

/**
 * Outbound comms. Today: per-tenant SMS OTP delivery. The OTP is NEVER logged or
 * returned in production — an unconfigured tenant in prod is a real "undeliverable"
 * error, not a console leak. Email/push + queues arrive later (CLAUDE.md §4, §12).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly isProduction: boolean;

  constructor(
    private readonly siteConfig: SiteConfigService,
    config: ConfigService<Env, true>,
  ) {
    // Use the validated NODE_ENV (like seed-dev), never raw process.env.
    this.isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  /**
   * Deliver an OTP for the active tenant. Routing (HARD RULES):
   *   - SMS configured (authKey + otpTemplateId) → MSG91, real delivery.
   *   - not configured + production              → throw; NEVER console-fall-back.
   *   - not configured + non-production          → dev console log (local/demo).
   * The code is passed to exactly one provider and never logged here.
   */
  async sendOtp(phone: string, code: string): Promise<void> {
    const provider = await this.resolveSmsProvider();
    await provider.sendOtp(phone, code);
  }

  private async resolveSmsProvider(): Promise<SmsProvider> {
    const sms = await this.siteConfig.getDecryptedSms(); // per-tenant, INTERNAL only
    const configured = Boolean(sms?.authKey && sms?.otpTemplateId);

    if (configured && sms) return new Msg91SmsProvider(sms);

    if (this.isProduction) {
      // No fallback in prod — surfacing the code via logs would be a leak.
      throw new ServiceUnavailableException('OTP delivery is not configured for this site');
    }
    return new ConsoleSmsProvider(this.logger);
  }
}
