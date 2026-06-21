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
import { ArticleService } from './article.service';
import { CreateArticleDto, ArticleQueryDto, UpdateArticleDto } from './dto/article.dto';

// apps/api/src/content/article.controller.ts — the reference every feature copies
@Controller('articles')
export class ArticleController {
  constructor(private readonly articles: ArticleService) {}

  // ── Public reads: @Public() skips the global JwtAuthGuard; tenant is still resolved ──
  @Public() @Get()
  list(@Query() q: ArticleQueryDto) {
    return this.articles.listPublished(q);
  }

  @Public() @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.articles.getPublishedBySlug(slug);
  }

  // ── Protected: JwtAuthGuard + PermissionsGuard apply; gate on a permission, never a role ──
  @RequirePermissions('article:viewAll') @Get('admin/all')
  listAll(@Query() q: ArticleQueryDto) {
    return this.articles.listAll(q);
  }

  @RequirePermissions('article:create') @Post()
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: AuthUser) {
    return this.articles.create(dto, user.id); // authorId from the token, never the body
  }

  @RequirePermissions('article:edit') @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articles.update(id, dto);
  }

  @RequirePermissions('article:publish') @HttpCode(200) @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.articles.publish(id);
  }

  @RequirePermissions('article:edit') @HttpCode(200) @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.articles.archive(id);
  }

  @RequirePermissions('article:delete') @HttpCode(204) @Delete(':id')
  remove(@Param('id') id: string) {
    return this.articles.remove(id);
  }
}
