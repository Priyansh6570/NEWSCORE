import { Module, type OnModuleInit } from '@nestjs/common';
import { MongoService } from '../database/mongo.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ArticleController } from './article.controller';
import { ArticleService } from './article.service';
import { ARTICLE_MODEL, ArticleSchema } from './article.schema';

/**
 * Content — the reference feature module (CLAUDE.md §12, Phase 2). Article CRUD,
 * the publish workflow, and permission-gated endpoints, tenant-scoped throughout.
 * Every later feature module copies this shape.
 */
@Module({
  imports: [TenancyModule],
  controllers: [ArticleController],
  providers: [ArticleService],
  exports: [ArticleService],
})
export class ContentModule implements OnModuleInit {
  constructor(private readonly mongo: MongoService) {}

  // Register the Article schema once so every tenant connection gets the model.
  onModuleInit(): void {
    this.mongo.registerTenantModel(ARTICLE_MODEL, ArticleSchema);
  }
}
