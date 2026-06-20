import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';

/**
 * Notifications (email/SMS/push). Minimal for now — only the SMS stub used by
 * OTP. Email/push + BullMQ queues arrive in later phases (CLAUDE.md §4, §12).
 */
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
