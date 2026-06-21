import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MEDIA_KINDS, type MediaKind } from '../media.schema';

/**
 * Upload metadata. The file itself arrives as multipart and is validated
 * server-side (MIME + size) in the service — that check, not this DTO, is the
 * authoritative gate. `kind` selects which allowlist/cap applies.
 */
export class UploadMediaDto {
  @IsIn(MEDIA_KINDS)
  kind!: MediaKind;
}

/** Page-based listing with an optional kind filter (the admin media library). */
export class MediaQueryDto {
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
  @IsIn(MEDIA_KINDS)
  kind?: MediaKind;
}

/** The shape returned to clients — never a raw Mongoose document. */
export interface MediaView {
  id: string;
  kind: MediaKind;
  key: string;
  url: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  originalName: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** A page of media assets, page-based (admin tables). */
export interface MediaPage {
  items: MediaView[];
  page: number;
  limit: number;
  total: number;
}
