/**
 * SiteConfig — the white-label contract the public website consumes.
 *
 * These types MIRROR the backend's `PublicSiteConfigView` (apps/api
 * .../site-config/dto/site-config.dto.ts) and its `ThemeTokens` /
 * `FeatureFlags` (.../site-config.schema.ts). For this phase the data is
 * MOCKED locally; next phase replaces `fetchSiteConfig` with a real call to
 * `GET /api/v1/site-config` and these types move to `@newscore/shared`.
 *
 * The brand name + logo here are TENANT DATA. No component, page title, or meta
 * tag may hardcode a brand string — they all read from the resolved config.
 */

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

export interface BlockConfig {
  id: string;
  type: string;
  enabled: boolean;
  props: Record<string, unknown>;
}

export interface PageLayout {
  page: string;
  blocks: BlockConfig[];
}

/** Exactly the backend's PublicSiteConfigView — never carries secrets. */
export interface PublicSiteConfig {
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

const ALL_FEATURES_OFF: FeatureFlags = {
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
  multilingual: true,
};

/**
 * MOCK tenant registry. Two tenants prove the white-label reskin:
 *  • "meridian" — the DEFAULT editorial brand (ivory/ink/vermilion). Its theme
 *    colors echo tokens.css, so the page also looks correct if a tenant ships no
 *    overrides at all.
 *  • "indus"    — a clearly different skin (cool paper, indigo accent) WITH a
 *    logo. Swapping to it must reskin masthead/footer/title/meta with zero
 *    component edits.
 * Next phase: this map is replaced by a Host -> tenant lookup against the
 * platform registry, then `GET /api/v1/site-config` per the resolved tenant.
 */
const MOCK_TENANTS: Record<string, PublicSiteConfig> = {
  meridian: {
    brand: {
      name: 'The Meridian',
      tagline: 'Independent, reader-funded journalism — in your language.',
      description: 'A multilingual daily covering India and the world.',
    },
    contact: { email: 'desk@meridian.example' },
    social: { x: '#', instagram: '#', youtube: '#' },
    // The default tenant ADOPTS the platform default tokens (ivory/ink/vermilion)
    // from app/styles/tokens.css — empty values mean "inherit", so NO override is
    // injected and editing tokens.css reskins this tenant directly (proof path a).
    theme: {
      colors: {
        primary: '',
        accent: '',
        ink: '',
        bg: '',
        surface: '',
        muted: '',
        border: '',
        success: '',
        danger: '',
      },
      typography: { fontSans: '', fontSerif: '', baseSize: '' },
      radius: { sm: '', md: '', lg: '' },
      logo: { light: '', dark: '', favicon: '' },
    },
    templateId: 'editorial',
    layouts: [],
    features: { ...ALL_FEATURES_OFF, videos: true, newsletter: true },
    locale: { default: 'en', available: ['en', 'hi', 'ta', 'bn', 'ur'] },
  },

  indus: {
    brand: {
      name: 'Indus Post',
      tagline: 'The subcontinent, in clear print.',
      description: 'Cool, considered reporting from across South Asia.',
    },
    contact: { email: 'newsroom@induspost.example' },
    social: { x: '#', youtube: '#' },
    theme: {
      colors: {
        primary: '#1f3a8a', // deep indigo (drives --accent-deep)
        accent: '#2f53c8', // indigo (drives --accent)
        ink: '#1b2230',
        bg: '#f3f5fa', // cool paper
        surface: '#ffffff',
        muted: '#6b7488',
        border: '#d4dae8',
        success: '#2f8f6a',
        danger: '#d23a52',
      },
      typography: { fontSans: '"Mukta", system-ui, sans-serif', fontSerif: '"Newsreader", Georgia, serif', baseSize: '17px' },
      radius: { sm: '6px', md: '10px', lg: '14px' },
      // A logo proves the masthead/footer render an image from config (not text).
      // Inline data-URI SVG so the proof needs no binary asset checked in.
      logo: {
        light:
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 60"><text x="0" y="46" font-family="Georgia,serif" font-size="48" font-weight="800" fill="%231b2230">Indus</text><text x="178" y="46" font-family="Georgia,serif" font-size="48" font-weight="800" fill="%232f53c8">Post</text></svg>',
          ),
        dark:
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 60"><text x="0" y="46" font-family="Georgia,serif" font-size="48" font-weight="800" fill="%23f3f5fa">Indus</text><text x="178" y="46" font-family="Georgia,serif" font-size="48" font-weight="800" fill="%237fa0ff">Post</text></svg>',
          ),
        favicon: '',
      },
    },
    templateId: 'editorial',
    layouts: [],
    features: { ...ALL_FEATURES_OFF, videos: true },
    locale: { default: 'en', available: ['en', 'hi', 'ur'] },
  },
};

export const DEFAULT_TENANT_SLUG = 'meridian';
export type TenantSlug = string;

/** Map a request Host to a tenant slug. The tenant is decided ONLY by the host
 *  (CLAUDE.md §5.2) — never by a client-supplied field — with dev escape hatches
 *  layered on top for local work (see {@link resolveTenantSlug}). */
const HOST_TO_TENANT: Record<string, TenantSlug> = {
  'meridian.localhost': 'meridian',
  'demo.localhost': 'meridian',
  'indus.localhost': 'indus',
  'meridian.example': 'meridian',
  'induspost.example': 'indus',
};

/**
 * Resolve the active tenant for a request.
 * Precedence (most specific first):
 *  1. `tenant` override (dev only) — set by middleware from `?tenant=` so you can
 *     flip tenants in a single browser without subdomains.
 *  2. Host header — the real production path (subdomain or custom domain).
 *  3. `DEV_TENANT_SLUG` env — pins a tenant for `localhost` with no override.
 *  4. DEFAULT_TENANT_SLUG.
 */
export function resolveTenantSlug(host: string | null, override?: string | null): TenantSlug {
  if (override && MOCK_TENANTS[override]) return override;

  const h = ((host ?? '').split(':')[0] ?? '').toLowerCase();
  const byHost = HOST_TO_TENANT[h];
  if (byHost) return byHost;

  const isLocal = h === 'localhost' || h === '127.0.0.1' || h === '' || h.endsWith('.localhost');
  if (isLocal) {
    const envTenant = process.env.DEV_TENANT_SLUG;
    if (envTenant && MOCK_TENANTS[envTenant]) return envTenant;
  }

  return DEFAULT_TENANT_SLUG;
}

/**
 * Fetch the resolved tenant's public SiteConfig.
 * MOCK for this phase; next phase becomes a cached `GET /api/v1/site-config`
 * scoped to the tenant. Always resolves to *some* config so the site renders.
 */
export async function fetchSiteConfig(slug: TenantSlug): Promise<PublicSiteConfig> {
  // DEFAULT_TENANT_SLUG is always present in MOCK_TENANTS, so this never returns undefined.
  return MOCK_TENANTS[slug] ?? (MOCK_TENANTS[DEFAULT_TENANT_SLUG] as PublicSiteConfig);
}

/** Known tenant slugs — used by dev tooling (e.g. the tenant switcher chip). */
export function listTenantSlugs(): TenantSlug[] {
  return Object.keys(MOCK_TENANTS);
}
