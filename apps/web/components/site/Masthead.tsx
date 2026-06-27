'use client';

import type { HomeContent } from '../../lib/content/home';
import { useBrand, useSiteConfig } from '../config-provider';

/**
 * Centered front-page masthead. The wordmark/logo is rendered ENTIRELY from the
 * active tenant's brand (config provider) — never a literal. If the tenant ships
 * a logo it renders the image; otherwise the brand name as the wordmark.
 */
export function Masthead({ content }: { content: HomeContent }) {
  const brand = useBrand();
  const { theme } = useSiteConfig();
  const logo = theme === 'dark' ? brand.logo.dark || brand.logo.light : brand.logo.light;

  return (
    <header className="wrap masthead">
      <div className="flanks wrap" style={{ paddingInline: 0 }}>
        <div className="dateblock">
          <div className="d1">{content.date}</div>
          <div className="d2">{content.edition}</div>
        </div>
        <div className="weather">
          <svg className="wx-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
          </svg>
          <div>
            <div className="wx-t">{content.weather.temp}</div>
            <div className="wx-m">
              {content.weather.city} · {content.weather.meta}
            </div>
          </div>
        </div>
      </div>
      <div className="edition">{content.edition}</div>
      <div className="wordmark">
        {logo ? (
          <img src={logo} alt={brand.name} />
        ) : (
          <>
            {brand.name}
            <span className="ast">✲</span>
          </>
        )}
      </div>
    </header>
  );
}
