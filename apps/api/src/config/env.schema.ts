import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1), // cluster connection — no db in the path
  PLATFORM_DB_NAME: z.string().min(1).default('newscore_platform'),
  REDIS_URL: z.string().min(1),

  // ── Auth: JWT access tokens + rotating refresh + OTP ──
  JWT_ACCESS_SECRET: z.string().min(32), // generate: openssl rand -base64 48
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),

  // ── Encryption key for per-tenant secrets at rest (Razorpay, SMS, …) ──
  SECRETS_ENC_KEY: z.string().min(16),

  // ── Media storage: Cloudflare R2 (S3-compatible). One bucket, per-tenant key prefix. ──
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ENDPOINT: z.string().url(), // e.g. https://<account>.r2.cloudflarestorage.com
  R2_PUBLIC_URL: z.string().url(), // public CDN origin objects are served from
  // add payment keys here as each module needs them
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
