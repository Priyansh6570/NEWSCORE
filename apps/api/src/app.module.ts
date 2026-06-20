import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { validateEnv } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { TenancyModule } from './tenancy/tenancy.module';

/**
 * Root application module.
 *
 * Phase 1 feature modules (auth, rbac, users, site-config, media,
 * notifications) are wired in here as they are built — see CLAUDE.md §12.
 */
@Module({
  imports: [
    // Validate env on boot; fail fast if anything required is missing/invalid.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // AsyncLocalStorage for request context. We mount ClsMiddleware manually in
    // TenancyModule so it runs before tenant resolution, hence mount: false here.
    ClsModule.forRoot({ global: true, middleware: { mount: false } }),
    DatabaseModule,
    RedisModule,
    TenancyModule,
  ],
})
export class AppModule {}
