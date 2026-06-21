import { Module, type OnModuleInit } from '@nestjs/common';
import { MongoService } from '../database/mongo.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { CATEGORY_MODEL, CategorySchema } from './category.schema';
import { TagController } from './tag.controller';
import { TagService } from './tag.service';
import { TAG_MODEL, TagSchema } from './tag.schema';
import { EditionController } from './edition.controller';
import { EditionService } from './edition.service';
import { EDITION_MODEL, EditionSchema } from './edition.schema';

/**
 * Taxonomy — the resources an Article references: categories, tags, editions.
 * Follows the Content module shape (CLAUDE.md §12). Public reads, writes gated on
 * taxonomy:manage (editions on edition:manage). Tenant-scoped throughout.
 */
@Module({
  imports: [TenancyModule],
  controllers: [CategoryController, TagController, EditionController],
  providers: [CategoryService, TagService, EditionService],
  exports: [CategoryService, TagService, EditionService],
})
export class TaxonomyModule implements OnModuleInit {
  constructor(private readonly mongo: MongoService) {}

  // Register the three schemas once so every tenant connection gets the models.
  onModuleInit(): void {
    this.mongo.registerTenantModel(CATEGORY_MODEL, CategorySchema);
    this.mongo.registerTenantModel(TAG_MODEL, TagSchema);
    this.mongo.registerTenantModel(EDITION_MODEL, EditionSchema);
  }
}
