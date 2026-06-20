import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Global Redis access — one client shared across the app. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
