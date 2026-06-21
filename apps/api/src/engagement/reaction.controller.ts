import { Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ReactionService } from './reaction.service';

@Controller('articles')
export class ReactionController {
  constructor(private readonly reactions: ReactionService) {}

  // Authenticated reader (token required, no permission). Idempotent like.
  @HttpCode(200) @Post(':articleId/like')
  like(@Param('articleId') articleId: string, @CurrentUser() user: AuthUser) {
    return this.reactions.like(articleId, user.id);
  }

  @HttpCode(200) @Delete(':articleId/like')
  unlike(@Param('articleId') articleId: string, @CurrentUser() user: AuthUser) {
    return this.reactions.unlike(articleId, user.id);
  }
}
