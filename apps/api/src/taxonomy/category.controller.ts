import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../rbac/permissions.guard';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/taxonomy.dto';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  // ── Public read: flat list; the client builds the tree from parentId/order ──
  @Public() @Get()
  list() {
    return this.categories.list();
  }

  // ── Protected writes: gated on taxonomy:manage (a permission, never a role) ──
  @RequirePermissions('taxonomy:manage') @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @RequirePermissions('taxonomy:manage') @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @RequirePermissions('taxonomy:manage') @HttpCode(204) @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
