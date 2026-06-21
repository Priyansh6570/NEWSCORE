import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

/**
 * Global access to the AES-256-GCM helper for per-tenant secrets at rest
 * (Razorpay keys, SMS credentials, …). One key derived from SECRETS_ENC_KEY.
 */
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
