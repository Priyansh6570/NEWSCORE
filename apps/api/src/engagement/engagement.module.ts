import { Module, type OnModuleInit } from '@nestjs/common';
import { MongoService } from '../database/mongo.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { COMMENT_MODEL, CommentSchema } from './comment.schema';
import { ReactionController } from './reaction.controller';
import { ReactionService } from './reaction.service';
import { REACTION_MODEL, ReactionSchema } from './reaction.schema';

/**
 * Engagement — reader comments (pre-moderated) and article reactions (likes).
 * Follows the Content module shape (CLAUDE.md §12). Comments default to 'pending'
 * and only surface publicly once approved; likes are idempotent via a unique
 * (articleId,userId) index and keep Article.likeCount in sync. Tenant-scoped; it
 * reads the Article model off the same tenant connection (registered by Content).
 */
@Module({
  imports: [TenancyModule],
  controllers: [CommentController, ReactionController],
  providers: [CommentService, ReactionService],
  exports: [CommentService, ReactionService],
})
export class EngagementModule implements OnModuleInit {
  constructor(private readonly mongo: MongoService) {}

  // Register the two schemas once so every tenant connection gets the models.
  onModuleInit(): void {
    this.mongo.registerTenantModel(COMMENT_MODEL, CommentSchema);
    this.mongo.registerTenantModel(REACTION_MODEL, ReactionSchema);
  }
}
