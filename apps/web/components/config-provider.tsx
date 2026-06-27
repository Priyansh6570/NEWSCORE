'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { FeatureFlags } from '../lib/tenant/site-config';
import type { Locale, ThemeMode } from '../lib/tenant/request-context';

/**
 * The single config provider. Everything the UI needs about the active tenant —
 * brand identity, locale, feature flags — flows through here. Components NEVER
 * hardcode a brand name/logo; they read `useBrand()`. Swapping the tenant
 * SiteConfig therefore reskins the whole surface with no component edits.
 */
export interface BrandView {
  name: string;
  tagline?: string;
  description?: string;
  logo: { light: string; dark: string };
}

export interface SiteConfigContextValue {
  tenantSlug: string;
  brand: BrandView;
  locale: Locale;
  dir: 'ltr' | 'rtl';
  availableLocales: string[];
  features: FeatureFlags;
  theme: ThemeMode;
}

const SiteConfigContext = createContext<SiteConfigContextValue | null>(null);

export function ConfigProvider({
  value,
  children,
}: {
  value: SiteConfigContextValue;
  children: ReactNode;
}) {
  return <SiteConfigContext.Provider value={value}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig(): SiteConfigContextValue {
  const ctx = useContext(SiteConfigContext);
  if (!ctx) throw new Error('useSiteConfig must be used within <ConfigProvider>');
  return ctx;
}

/** Brand identity (name, logo, tagline) — the only source of brand strings. */
export function useBrand(): BrandView {
  return useSiteConfig().brand;
}

/** Gate UI by a tenant feature flag. The real boundary is the API; this only
 *  shows/hides chrome (mirrors the backend's FeatureGuard intent). */
export function useFeature(flag: keyof FeatureFlags): boolean {
  return useSiteConfig().features[flag];
}
