import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../config/env.schema';

/**
 * Single shared Redis client (Upstash-compatible). Extends ioredis so callers
 * use the standard command API (get/set/expire/...). Connects lazily on first
 * command and closes cleanly on shutdown.
 */
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super(config.get('REDIS_URL', { infer: true }), { lazyConnect: true });
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}
