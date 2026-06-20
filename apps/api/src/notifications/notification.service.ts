import { Injectable, Logger } from '@nestjs/common';

/**
 * Outbound comms abstraction. For now sendSms() just logs — MSG91 (DLT) is wired
 * in the integrations phase (CLAUDE.md §3, §12). The public surface stays stable
 * so callers (e.g. OTP) don't change when the real provider lands.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  // eslint-disable-next-line @typescript-eslint/require-await
  async sendSms(to: string, message: string): Promise<void> {
    // NEVER log the OTP itself in production; this stub is dev-only scaffolding.
    this.logger.log(`[sms:stub] to=${to} message=${message}`);
  }
}
