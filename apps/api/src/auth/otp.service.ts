import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import type { Env } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

// Per-phone request throttle: at most MAX requests per WINDOW seconds.
const RL_MAX_REQUESTS = 5;
const RL_WINDOW_SECONDS = 60;

@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly ctx: TenantContextService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Keys are namespaced per tenant so codes never cross tenant boundaries.
  private codeKey(phone: string): string {
    return `tenant:${this.ctx.tenantId}:otp:${phone}`;
  }
  private rateKey(phone: string): string {
    return `tenant:${this.ctx.tenantId}:otp:rl:${phone}`;
  }

  /**
   * Generate, store (single-use, TTL'd) and return an OTP for the phone.
   * Throttled per phone. The caller is responsible for delivery (SMS) and must
   * NOT leak whether the phone maps to an existing user.
   */
  async generate(phone: string): Promise<string> {
    const rlKey = this.rateKey(phone);
    const count = await this.redis.incr(rlKey);
    if (count === 1) await this.redis.expire(rlKey, RL_WINDOW_SECONDS);
    if (count > RL_MAX_REQUESTS) {
      throw new HttpException('Too many OTP requests, try again later', HttpStatus.TOO_MANY_REQUESTS);
    }

    const length = this.config.get('OTP_LENGTH', { infer: true });
    let code = '';
    for (let i = 0; i < length; i++) code += randomInt(0, 10).toString();

    const ttl = this.config.get('OTP_TTL_SECONDS', { infer: true });
    await this.redis.set(this.codeKey(phone), code, 'EX', ttl);
    return code;
  }

  /** Verify a code and consume it (single-use). Returns true on a match. */
  async verify(phone: string, code: string): Promise<boolean> {
    const key = this.codeKey(phone);
    const stored = await this.redis.get(key);
    if (!stored || stored !== code) return false;
    await this.redis.del(key);
    return true;
  }
}
