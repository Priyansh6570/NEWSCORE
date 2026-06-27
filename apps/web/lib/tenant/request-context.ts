import { headers } from 'next/headers';
import {
  DEFAULT_TENANT_SLUG,
  fetchSiteConfig,
  resolveTenantSlug,
  type PublicSiteConfig,
  type TenantSlug,
} from './site-config';

/** Scripts the editorial type system + content are wired for. */
export const SUPPORTED_LOCALES = ['en', 'hi', 'ta', 'bn', 'ur'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type ThemeMode = 'light' | 'dark';

const RTL_LOCALES = new Set<Locale>(['ur']);

export interface RequestContext {
  tenantSlug: TenantSlug;
  config: PublicSiteConfig;
  locale: Locale;
  dir: 'ltr' | 'rtl';
  theme: ThemeMode;
}

function coerceLocale(value: string | null, fallback: Locale): Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '')
    ? (value as Locale)
    : fallback;
}

/**
 * Resolve everything a request needs, from headers set by middleware.ts
 * (`x-tenant-slug`, `x-locale`, `x-theme`). The tenant comes from the Host (the
 * middleware already applied the `?tenant=` dev override); locale defaults to the
 * tenant's configured default; theme defaults to light. Reading headers() keeps
 * this resolution available in the root layout, where `searchParams` is not.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const tenantSlug = h.get('x-tenant-slug') ?? DEFAULT_TENANT_SLUG;
  const config = await fetchSiteConfig(tenantSlug);

  const locale = coerceLocale(h.get('x-locale'), coerceLocale(config.locale.default, 'en'));
  const theme: ThemeMode = h.get('x-theme') === 'dark' ? 'dark' : 'light';

  return {
    tenantSlug,
    config,
    locale,
    dir: RTL_LOCALES.has(locale) ? 'rtl' : 'ltr',
    theme,
  };
}
