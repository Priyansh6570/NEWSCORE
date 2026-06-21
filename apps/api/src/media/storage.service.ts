import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../config/env.schema';

/**
 * Thin wrapper over the S3-compatible Cloudflare R2 API. One bucket holds every
 * tenant's objects, separated by a per-tenant key prefix (see MediaService).
 * Credentials come from the validated env and are never logged.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.bucket = this.config.get('R2_BUCKET', { infer: true });
    // strip any trailing slash so publicUrl joins cleanly
    this.publicBase = this.config.get('R2_PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
    this.client = new S3Client({
      region: 'auto', // R2 ignores region but the SDK requires one
      endpoint: this.config.get('R2_ENDPOINT', { infer: true }),
      credentials: {
        accessKeyId: this.config.get('R2_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: this.config.get('R2_SECRET_ACCESS_KEY', { infer: true }),
      },
    });
  }

  /** Upload an object under `key`, overwriting any existing object at that key. */
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Delete the object at `key` (idempotent — R2 does not error on a missing key). */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** The public CDN URL an object is served from. */
  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }
}
