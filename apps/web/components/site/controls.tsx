'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSiteConfig } from '../config-provider';

/** Native language label for each supported script. */
const LANG_LABELS: Record<string, { native: string; en: string }> = {
  en: { native: 'English', en: 'EN' },
  hi: { native: 'हिन्दी', en: 'Hindi' },
  ta: { native: 'தமிழ்', en: 'Tamil' },
  bn: { native: 'বাংলা', en: 'Bengali' },
  ur: { native: 'اردو', en: 'Urdu' },
};

/** Preserve the other query params (tenant/theme) while changing one. */
function withParam(params: URLSearchParams, key: string, value: string): string {
  const next = new URLSearchParams(params);
  next.set(key, value);
  return `?${next.toString()}`;
}

/** Light/dark toggle. Persists to localStorage; the pre-paint ThemeScript
 *  restores it on the next load. Also pins the choice into the URL so a server
 *  re-render (e.g. language change) keeps it. */
export function ThemeToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setMode(current === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next = mode === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('newscore-theme', next);
    } catch {
      /* ignore */
    }
    setMode(next);
    router.replace(`${pathname}${withParam(params, 'theme', next)}`, { scroll: false });
  }

  return (
    <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}

/** Language switcher. Reads the tenant's available locales from config and
 *  navigates with ?lang=… so the server re-renders content + the :lang() type
 *  system in the chosen script. */
export function LangMenu() {
  const { locale, availableLocales } = useSiteConfig();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  const current = LANG_LABELS[locale]?.native ?? locale;

  return (
    <div className={`lang${open ? ' open' : ''}`}>
      <button
        className="lang-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <svg className="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
        </svg>
        <span>{current}</span>
        <svg className="car" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div className="lang-menu">
        {availableLocales.map((code) => {
          const label = LANG_LABELS[code] ?? { native: code, en: code.toUpperCase() };
          return (
            <a
              key={code}
              className={code === locale ? 'active' : ''}
              href={`${pathname}${withParam(params, 'lang', code)}`}
            >
              <span>{label.native}</span>
              <span className="en">{label.en}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/** DEV-ONLY tenant switcher chip row — proves the per-tenant reskin path in a
 *  single browser. Hidden in production (the Host decides the tenant there). */
export function TenantSwitcher({ tenants }: { tenants: string[] }) {
  const { tenantSlug } = useSiteConfig();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="sections" aria-label="Dev: switch tenant">
      {tenants.map((slug) => (
        <a
          key={slug}
          className={`chip${slug === tenantSlug ? ' active' : ''}`}
          href={`${pathname}${withParam(params, 'tenant', slug)}`}
        >
          {slug}
        </a>
      ))}
    </div>
  );
}
