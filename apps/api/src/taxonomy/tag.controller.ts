import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../rbac/permissions.guard';
import { TagService } from './tag.service';
import { CreateTagDto, UpdateTagDto } from './dto/taxonomy.dto';

@Controller('tags')
export class TagController {
  constructor(private readonly tags: TagService) {}

  @Public() @Get()
  list() {
    return this.tags.list();
  }

  @RequirePermissions('taxonomy:manage') @Post()
  create(@Body() dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @RequirePermissions('taxonomy:manage') @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @RequirePermissions('taxonomy:manage') @HttpCode(204) @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tags.remove(id);
  }
}
