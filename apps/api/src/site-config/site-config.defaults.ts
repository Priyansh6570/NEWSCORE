import { Types } from 'mongoose';
import type { FeatureFlags, SiteConfigDoc, ThemeTokens } from './site-config.schema';

/** A neutral, brandless theme — tenants override every token from the admin. */
export const DEFAULT_THEME: ThemeTokens = {
  colors: {
    primary: '#1d4ed8',
    accent: '#f59e0b',
    ink: '#111827',
    bg: '#ffffff',
    surface: '#f9fafb',
    muted: '#6b7280',
    border: '#e5e7eb',
    success: '#16a34a',
    danger: '#dc2626',
  },
  typography: { fontSans: 'system-ui, sans-serif', fontSerif: 'Georgia, serif', baseSize: '16px' },
  radius: { sm: '4px', md: '8px', lg: '16px' },
  logo: { light: '', dark: '', favicon: '' },
};

/** Every optional capability is off until a tenant turns it on. */
export const DEFAULT_FEATURES: FeatureFlags = {
  comments: false,
  epaper: false,
  videos: false,
  reels: false,
  audioBulletins: false,
  subscriptions: false,
  paywall: false,
  ads: false,
  newsletter: false,
  pushNotifications: false,
  personalization: false,
  multilingual: false,
};

/** The default SiteConfig seeded on first read (or by the dev seed). */
export function buildDefaultSiteConfig(
  tenantId: string,
  brandName: string,
): Pick<
  SiteConfigDoc,
  'tenantId' | 'brand' | 'contact' | 'social' | 'theme' | 'templateId' | 'layouts' | 'features' | 'locale' | 'integrations'
> {
  return {
    tenantId: new Types.ObjectId(tenantId),
    brand: { name: brandName },
    contact: {},
    social: {},
    theme: DEFAULT_THEME,
    templateId: 'classic',
    layouts: [],
    features: DEFAULT_FEATURES,
    locale: { default: 'en', available: ['en'] },
    integrations: {},
  };
}
