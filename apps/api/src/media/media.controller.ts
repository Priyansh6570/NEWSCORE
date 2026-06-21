import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../rbac/permissions.guard';
import { MediaService, MAX_UPLOAD_BYTES } from './media.service';
import { MediaQueryDto, UploadMediaDto } from './dto/media.dto';

// apps/api/src/media/media.controller.ts — R2-backed uploads, tenant-scoped.
// No public endpoint: files are served straight from the R2 public URL on each doc.
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  // The interceptor caps the buffered size at the largest per-kind cap; the
  // service then enforces the exact per-kind cap + MIME allowlist (the real gate).
  @RequirePermissions('media:upload')
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.media.upload(file, dto.kind, user.id); // uploaderId from the token
  }

  @RequirePermissions('media:manage')
  @Get()
  list(@Query() q: MediaQueryDto) {
    return this.media.list(q);
  }

  @RequirePermissions('media:manage')
  @HttpCode(204)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.media.remove(id);
  }
}
