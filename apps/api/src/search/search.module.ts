import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * Search (CLAUDE.md Phase 5) — public, tenant-scoped full-text search over
 * published articles via Atlas Search ($search). Registers no schemas: it reads
 * the Article model attached to each tenant connection by ContentModule, and
 * reuses content's body-free card projection. Pure read path, no writes.
 */
@Module({
  imports: [TenancyModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
