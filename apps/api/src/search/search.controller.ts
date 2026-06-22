import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SearchQueryDto } from './dto/search.dto';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  // Public, tenant-scoped full-text search over published articles. Body-free results.
  @Public() @Get()
  query(@Query() q: SearchQueryDto) {
    return this.search.search(q);
  }
}
