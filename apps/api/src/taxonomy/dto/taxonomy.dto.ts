import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

// ── Category ──────────────────────────────────────────────────────────────

/** Create a category. slug is derived from name (unique); not settable here. */
export class CreateCategoryDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsMongoId()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

/** Rename / reorder / reparent. slug stays stable; status of refs unaffected. */
export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  // Pass null to reparent to the top level (clear the parent); an id to reparent.
  @IsOptional()
  @ValidateIf((o: UpdateCategoryDto) => o.parentId !== null)
  @IsMongoId()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
  order: number;
}

// ── Tag ─────────────────────────────────────────────────────────────────────

export class CreateTagDto {
  @IsString()
  @MaxLength(120)
  name!: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export interface TagView {
  id: string;
  name: string;
  slug: string;
}

// ── Edition ─────────────────────────────────────────────────────────────────

export class CreateEditionDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  districtCode?: string;
}

export class UpdateEditionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  districtCode?: string;
}

export interface EditionView {
  id: string;
  name: string;
  slug: string;
  districtCode?: string;
}
