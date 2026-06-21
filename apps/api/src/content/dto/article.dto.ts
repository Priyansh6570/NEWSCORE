import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** SEO overrides — all optional; the API fills sensible fallbacks elsewhere. */
export class ArticleSeoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  ogImage?: string;
}

/**
 * Create an article. status is NOT settable here — new articles are always
 * 'draft' and move through the publish workflow. authorId comes from the access
 * token (never the body). Taxonomy/media refs are validated as ObjectIds only.
 */
export class CreateArticleDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  excerpt?: string;

  @IsObject()
  body!: Record<string, unknown>;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  editionIds?: string[];

  @IsOptional()
  @IsMongoId()
  coverMediaId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsBoolean()
  isBreaking?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ArticleSeoDto)
  seo?: ArticleSeoDto;
}

/**
 * Patch an article. Every field is optional; status is intentionally absent —
 * status only changes through publish/archive. The slug is fixed at creation and
 * deliberately NOT regenerated when the title changes, so published URLs stay stable.
 */
export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  excerpt?: string;

  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  editionIds?: string[];

  @IsOptional()
  @IsMongoId()
  coverMediaId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsBoolean()
  isBreaking?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ArticleSeoDto)
  seo?: ArticleSeoDto;
}

/** Page-based listing with optional taxonomy filters. */
export class ArticleQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsMongoId()
  tagId?: string;

  @IsOptional()
  @IsMongoId()
  editionId?: string;
}

/** The shape returned to clients — never a raw Mongoose document. */
export interface ArticleView {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  body: Record<string, unknown>;
  status: string;
  categoryId?: string;
  tagIds: string[];
  editionIds: string[];
  authorId: string;
  coverMediaId?: string;
  mediaIds: string[];
  isBreaking: boolean;
  isFeatured: boolean;
  seo: { title?: string; description?: string; ogImage?: string };
  scheduledAt?: string;
  publishedAt?: string;
  views: number;
  createdAt: string;
  updatedAt: string;
}

/** A page of articles, page-based (admin tables + public feeds). */
export interface ArticlePage {
  items: ArticleView[];
  page: number;
  limit: number;
  total: number;
}
