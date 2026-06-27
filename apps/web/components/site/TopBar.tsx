import type { HomeContent } from '../../lib/content/home';
import { LangMenu, ThemeToggle } from './controls';

/** Sticky top bar: search, theme toggle, language switcher, auth actions.
 *  All labels come from localized content; no brand literals live here. */
export function TopBar({ content }: { content: HomeContent }) {
  return (
    <div className="topbar">
      <div className="wrap row">
        <div className="left">
          <span className="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input placeholder={content.searchPlaceholder} />
          </span>
        </div>
        <div className="right">
          <ThemeToggle />
          <LangMenu />
          <button className="btn btn-outline btn-sm">{content.login}</button>
          <button className="btn btn-primary btn-sm">{content.subscribe}</button>
        </div>
      </div>
    </div>
  );
}
