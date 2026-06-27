import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ConfigProvider, type SiteConfigContextValue } from '../components/config-provider';
import { TenantThemeStyle } from '../components/tenant-theme-style';
import { ThemeScript } from '../components/theme-script';
import { getRequestContext } from '../lib/tenant/request-context';

// Google Fonts for the editorial type system (Latin + Devanagari/Tamil/Bengali/Urdu).
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;0,6..72,800;1,6..72,400;1,6..72,500&family=Eczar:wght@400;500;600;700;800&family=Tiro+Devanagari+Hindi:ital@0;1&family=Tiro+Tamil:ital@0;1&family=Tiro+Bangla:ital@0;1&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Mukta:wght@300;400;500;600;700&display=swap';

/** Title + description come from the tenant's brand — never a literal. */
export async function generateMetadata(): Promise<Metadata> {
  const { config } = await getRequestContext();
  const { brand, theme } = config;
  return {
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: brand.description ?? brand.tagline,
    icons: theme.logo.favicon ? { icon: theme.logo.favicon } : undefined,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const ctx = await getRequestContext();
  const { config } = ctx;

  const providerValue: SiteConfigContextValue = {
    tenantSlug: ctx.tenantSlug,
    brand: {
      name: config.brand.name,
      tagline: config.brand.tagline,
      description: config.brand.description,
      logo: { light: config.theme.logo.light, dark: config.theme.logo.dark },
    },
    locale: ctx.locale,
    dir: ctx.dir,
    availableLocales: config.locale.available,
    features: config.features,
    theme: ctx.theme,
  };

  return (
    <html lang={ctx.locale} dir={ctx.dir} data-theme={ctx.theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_HREF} />
        {/* Runtime white-label: tenant brand overrides, server-rendered before paint. */}
        <TenantThemeStyle config={config} />
        {/* Restore saved light/dark before paint (no flash). */}
        <ThemeScript />
      </head>
      <body>
        <ConfigProvider value={providerValue}>{children}</ConfigProvider>
      </body>
    </html>
  );
}
