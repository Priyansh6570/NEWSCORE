import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { ARTICLE_MODEL, type ArticleDoc } from '../content/article.schema';
import { toArticleCardView } from '../content/article.service';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { type SearchPage, type SearchQueryDto } from './dto/search.dto';
import { buildSearchPipeline, clampSearchLimit } from './search.pipeline';

@Injectable()
export class SearchService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  /** Article model on the ACTIVE tenant's connection — search never crosses tenants. */
  private model(): Model<ArticleDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<ArticleDoc>(ARTICLE_MODEL);
  }

  /**
   * Full-text search over this tenant's published articles via Atlas Search.
   * Empty/whitespace q short-circuits to an empty page — no $search call. Results
   * are always body-free cards (premium body never returned; isPremium kept).
   */
  async search(dto: SearchQueryDto): Promise<SearchPage> {
    const query = (dto.q ?? '').trim();
    const page = dto.page ?? 1;
    const limit = clampSearchLimit(dto.limit);

    if (!query) return { items: [], page, limit, query: '' };

    const pipeline = buildSearchPipeline(query, { page, limit, now: new Date() });
    const docs = await this.model().aggregate<ArticleDoc>(pipeline);
    return { items: docs.map(toArticleCardView), page, limit, query };
  }
}
