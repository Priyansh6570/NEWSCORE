import { Schema, Types } from 'mongoose';

/** Mongoose model name for the white-label config (tenant DB, one doc/tenant). */
export const SITE_CONFIG_MODEL = 'SiteConfig';

// ── White-label shapes (CLAUDE.md §7–§9) ────────────────────────────────────

export interface ThemeTokens {
  colors: {
    primary: string;
    accent: string;
    ink: string;
    bg: string;
    surface: string;
    muted: string;
    border: string;
    success: string;
    danger: string;
  };
  typography: { fontSans: string; fontSerif: string; baseSize: string };
  radius: { sm: string; md: string; lg: string };
  logo: { light: string; dark: string; favicon: string };
}

export interface FeatureFlags {
  comments: boolean;
  epaper: boolean;
  videos: boolean;
  reels: boolean;
  audioBulletins: boolean;
  subscriptions: boolean;
  paywall: boolean;
  ads: boolean;
  newsletter: boolean;
  pushNotifications: boolean;
  personalization: boolean;
  multilingual: boolean;
}

/** A page section: a typed block with an enable flag and block-specific props. */
export interface BlockConfig {
  id: string;
  type: string;
  enabled: boolean;
  props: Record<string, unknown>;
}

/** An ordered arrangement of blocks for one page. Layout is data, not code. */
export interface PageLayout {
  page: string;
  blocks: BlockConfig[];
}

/** Per-tenant integration secrets — encrypted at rest, NEVER returned publicly. */
export interface SiteConfigIntegrations {
  razorpay?: { keyId: string; keySecretEnc: string; webhookSecretEnc: string };
  // MSG91 SMS: authKey is the secret (encrypted); provider/senderId/otpTemplateId
  // are DLT onboarding values (not secret). senderId surfaces in admin STATUS only.
  sms?: { provider: string; authKeyEnc: string; senderId: string; otpTemplateId: string };
}

export interface SiteConfigDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  brand: { name: string; tagline?: string; description?: string };
  contact: { email?: string; phone?: string; address?: string };
  social: { facebook?: string; x?: string; youtube?: string; instagram?: string };
  theme: ThemeTokens;
  templateId: string;
  layouts: PageLayout[];
  features: FeatureFlags;
  locale: { default: string; available: string[] };
  customCss?: string;
  integrations: SiteConfigIntegrations;
  createdAt: Date;
  updatedAt: Date;
}

// Sub-schemas use _id:false — they are embedded value objects, not collections.
const ThemeSchema = new Schema<ThemeTokens>(
  {
    colors: {
      primary: String,
      accent: String,
      ink: String,
      bg: String,
      surface: String,
      muted: String,
      border: String,
      success: String,
      danger: String,
    },
    typography: { fontSans: String, fontSerif: String, baseSize: String },
    radius: { sm: String, md: String, lg: String },
    logo: { light: String, dark: String, favicon: String },
  },
  { _id: false },
);

const IntegrationsSchema = new Schema<SiteConfigIntegrations>(
  {
    razorpay: {
      type: { keyId: String, keySecretEnc: String, webhookSecretEnc: String },
      required: false,
      default: undefined,
    },
    sms: {
      type: { provider: String, authKeyEnc: String, senderId: String, otpTemplateId: String },
      required: false,
      default: undefined,
    },
  },
  { _id: false },
);

export const SiteConfigSchema = new Schema<SiteConfigDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    brand: {
      name: { type: String, required: true, trim: true },
      tagline: { type: String, trim: true },
      description: { type: String, trim: true },
    },
    contact: {
      email: { type: String, trim: true },
      phone: { type: String, trim: true },
      address: { type: String, trim: true },
    },
    social: {
      facebook: String,
      x: String,
      youtube: String,
      instagram: String,
    },
    theme: { type: ThemeSchema, required: true },
    templateId: { type: String, required: true, default: 'classic' },
    layouts: { type: Schema.Types.Mixed, default: [] },
    features: { type: Schema.Types.Mixed, required: true },
    locale: {
      default: { type: String, required: true, default: 'en' },
      available: { type: [String], default: ['en'] },
    },
    customCss: { type: String },
    // Encrypted secrets live here; toPublicView must never expose this field.
    integrations: { type: IntegrationsSchema, default: () => ({}) },
  },
  { collection: 'site_config', timestamps: true },
);

// Exactly one config document per tenant.
SiteConfigSchema.index({ tenantId: 1 }, { unique: true });
