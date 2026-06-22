import { Logger } from '@nestjs/common';
import type { DecryptedSms } from '../site-config/dto/site-config.dto';
import { sendOtpViaMsg91 } from './msg91.client';

/**
 * The delivery seam behind NotificationsService. Two implementations: real MSG91
 * delivery, and a DEV-ONLY console provider used when a tenant has no SMS config
 * (so local/demo login works without DLT). The OTP code is handled by exactly one
 * provider per call and never crosses into logs except via the dev console path.
 */
export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

/** Real delivery via MSG91 with the tenant's decrypted config. Never logs the code. */
export class Msg91SmsProvider implements SmsProvider {
  constructor(private readonly cfg: DecryptedSms) {}

  sendOtp(phone: string, code: string): Promise<void> {
    return sendOtpViaMsg91(this.cfg, phone, code);
  }
}

/**
 * DEV-ONLY fallback: logs the code so local/demo login works without a real SMS
 * provider. NEVER selected in production — that path throws instead (see
 * NotificationsService), so the code is never logged in prod.
 */
export class ConsoleSmsProvider implements SmsProvider {
  constructor(private readonly logger: Logger) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async sendOtp(phone: string, code: string): Promise<void> {
    this.logger.warn(`[dev OTP] ${phone} -> ${code}`);
  }
}
