import { Module } from '@nestjs/common';

/**
 * Root application module.
 *
 * Phase 1 feature modules (config, tenancy, auth, rbac, users, site-config,
 * media, notifications) are wired in here as they are built — see CLAUDE.md §12.
 */
@Module({
  imports: [],
})
export class AppModule {}
