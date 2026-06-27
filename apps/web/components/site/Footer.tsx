'use client';

import type { HomeContent } from '../../lib/content/home';
import { useBrand, useSiteConfig } from '../config-provider';

/**
 * Site footer. The brand wordmark/logo and the legal line are rendered from the
 * tenant's brand (config provider) — swapping the tenant reskins this with no
 * edits here. Section/company links come from localized content.
 */
export function Footer({ content }: { content: HomeContent }) {
  const brand = useBrand();
  const { theme } = useSiteConfig();
  const logo = theme === 'dark' ? brand.logo.dark || brand.logo.light : brand.logo.light;
  const year = new Date().getFullYear();

  return (
    <footer className="wrap foot">
      <div className="foot-top">
        <div className="foot-brand">
          <div className="fm">
            {logo ? (
              <img src={logo} alt={brand.name} />
            ) : (
              <>
                {brand.name}
                <span className="ast">✲</span>
              </>
            )}
          </div>
          <p>{brand.tagline ?? content.footerTagline}</p>
        </div>
        {content.footerColumns.map((col) => (
          <div className="foot-col" key={col.heading}>
            <h4>{col.heading}</h4>
            <ul>
              {col.links.map((link) => (
                <li key={link}>
                  <a>{link}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="foot-bar">
        <p>
          © {year} {brand.name}
        </p>
        <p>{brand.name}</p>
      </div>
    </footer>
  );
}
