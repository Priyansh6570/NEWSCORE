import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../rbac/permissions.guard';
import { EditionService } from './edition.service';
import { CreateEditionDto, UpdateEditionDto } from './dto/taxonomy.dto';

@Controller('editions')
export class EditionController {
  constructor(private readonly editions: EditionService) {}

  @Public() @Get()
  list() {
    return this.editions.list();
  }

  // ── Editions are gated on edition:manage (per the permission catalog) ──
  @RequirePermissions('edition:manage') @Post()
  create(@Body() dto: CreateEditionDto) {
    return this.editions.create(dto);
  }

  @RequirePermissions('edition:manage') @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEditionDto) {
    return this.editions.update(id, dto);
  }

  @RequirePermissions('edition:manage') @HttpCode(204) @Delete(':id')
  remove(@Param('id') id: string) {
    return this.editions.remove(id);
  }
}
