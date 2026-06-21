// apps/api/src/common/encryption.service.ts — AES-256-GCM for per-tenant secrets at rest
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { Env } from '../config/env.schema';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    // Derive a fixed 32-byte key from SECRETS_ENC_KEY (any length) via scrypt.
    this.key = scryptSync(config.get('SECRETS_ENC_KEY', { infer: true }), 'newscore.secrets.v1', 32);
  }

  /** -> "iv.tag.ciphertext", each segment base64url. */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
  }

  decrypt(payload: string): string {
    const [iv, tag, ct] = payload.split('.');
    if (!iv || !tag || !ct) throw new Error('Malformed ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  }
}
