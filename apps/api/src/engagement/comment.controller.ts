import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../rbac/permissions.guard';
import { CommentService } from './comment.service';
import {
  CommentQueryDto,
  CreateCommentDto,
  ModerationQueryDto,
} from './dto/engagement.dto';

@Controller()
export class CommentController {
  constructor(private readonly comments: CommentService) {}

  // ── Reader: authenticated but permission-free. No @Public (a token IS
  //    required), no @RequirePermissions (PermissionsGuard passes with none). ──
  @Post('articles/:articleId/comments')
  create(
    @Param('articleId') articleId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.create(articleId, dto, user.id); // author from the token, never the body
  }

  // ── Public read: only approved comments, threaded by parentId ──
  @Public() @Get('articles/:articleId/comments')
  listPublic(@Param('articleId') articleId: string, @Query() q: CommentQueryDto) {
    return this.comments.listPublic(articleId, q);
  }

  // ── Moderation: gated on comment:moderate (a permission, never a role) ──
  @RequirePermissions('comment:moderate') @Get('comments/moderation')
  moderationQueue(@Query() q: ModerationQueryDto) {
    return this.comments.moderationQueue(q);
  }

  @RequirePermissions('comment:moderate') @HttpCode(200) @Patch('comments/:id/approve')
  approve(@Param('id') id: string) {
    return this.comments.approve(id);
  }

  @RequirePermissions('comment:moderate') @HttpCode(200) @Patch('comments/:id/reject')
  reject(@Param('id') id: string) {
    return this.comments.reject(id);
  }

  @RequirePermissions('comment:moderate') @HttpCode(204) @Delete('comments/:id')
  remove(@Param('id') id: string) {
    return this.comments.remove(id);
  }
}
