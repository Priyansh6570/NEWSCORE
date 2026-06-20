import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.schema';
import { DatabaseModule } from './database/database.module';

/**
 * Root application module.
 *
 * Phase 1 feature modules (tenancy, auth, rbac, users, site-config, media,
 * notifications) are wired in here as they are built — see CLAUDE.md §12.
 */
@Module({
  imports: [
    // Validate env on boot; fail fast if anything required is missing/invalid.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
  ],
})
export class AppModule {}
