import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type {
  FeatureFlags,
  PageLayout,
  ThemeTokens,
} from '../site-config.schema';

// ── Nested patch DTOs (every field optional — PATCH replaces provided sections) ──

class BrandDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(200) tagline?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

class ContactDto {
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}

class SocialDto {
  @IsOptional() @IsString() @MaxLength(300) facebook?: string;
  @IsOptional() @IsString() @MaxLength(300) x?: string;
  @IsOptional() @IsString() @MaxLength(300) youtube?: string;
  @IsOptional() @IsString() @MaxLength(300) instagram?: string;
}

class LocaleDto {
  @IsOptional() @IsString() @MaxLength(16) default?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) available?: string[];
}

/**
 * Patch the editable, public-facing config. Integrations are intentionally NOT
 * here — secrets are set only via the dedicated, encrypting endpoint. theme,
 * features, and layouts are validated as structured objects/arrays; their inner
 * token maps are free-form by design (white-label).
 */
export class UpdateSiteConfigDto {
  @IsOptional() @ValidateNested() @Type(() => BrandDto) brand?: BrandDto;
  @IsOptional() @ValidateNested() @Type(() => ContactDto) contact?: ContactDto;
  @IsOptional() @ValidateNested() @Type(() => SocialDto) social?: SocialDto;
  @IsOptional() @ValidateNested() @Type(() => LocaleDto) locale?: LocaleDto;

  @IsOptional() @IsString() @MaxLength(64) templateId?: string;
  @IsOptional() @IsObject() theme?: ThemeTokens;
  @IsOptional() @IsObject() features?: Partial<FeatureFlags>;
  @IsOptional() @IsArray() layouts?: PageLayout[];
  @IsOptional() @IsString() @MaxLength(50_000) customCss?: string;
}

/** Set/rotate the tenant's Razorpay keys. Plaintext in; only status comes back. */
export class SetRazorpayKeysDto {
  @IsString() @IsNotEmpty() @MaxLength(200) keyId!: string;
  @IsString() @IsNotEmpty() @MaxLength(400) keySecret!: string;
  @IsString() @IsNotEmpty() @MaxLength(400) webhookSecret!: string;
}

// ── View shapes ──────────────────────────────────────────────────────────────

/** The public, brandable config — never carries integrations or any secret. */
export interface PublicSiteConfigView {
  brand: { name: string; tagline?: string; description?: string };
  contact: { email?: string; phone?: string; address?: string };
  social: { facebook?: string; x?: string; youtube?: string; instagram?: string };
  theme: ThemeTokens;
  templateId: string;
  layouts: PageLayout[];
  features: FeatureFlags;
  locale: { default: string; available: string[] };
  customCss?: string;
}

/** Integration presence/identifiers for the admin — still no secrets. */
export interface IntegrationsStatus {
  razorpay: { configured: boolean; keyId?: string };
  sms: { configured: boolean; senderId?: string };
}

/** The admin view: everything editable plus integration STATUS (no secrets). */
export interface AdminSiteConfigView extends PublicSiteConfigView {
  integrations: IntegrationsStatus;
}

/** Returned after setting Razorpay keys — confirmation only, never the secret. */
export interface RazorpayStatus {
  configured: true;
  keyId: string;
}
