import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { ArticleView } from '../../content/dto/article.dto';

/** Public search query. An empty/whitespace q yields an empty page (no $search). */
export class SearchQueryDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  // No @Max here — the service clamps to 50 rather than rejecting an over-large limit.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 10;
}

/** A page of search results — body-free article cards, ordered by search score. */
export interface SearchPage {
  items: ArticleView[];
  page: number;
  limit: number;
  query: string;
}
