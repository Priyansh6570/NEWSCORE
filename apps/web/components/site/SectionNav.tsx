import type { HomeContent } from '../../lib/content/home';

/** Section pill row. The first item is the active section on the home surface. */
export function SectionNav({ content }: { content: HomeContent }) {
  return (
    <nav className="wrap sections">
      {content.nav.map((label, i) => (
        <a key={label} className={`chip${i === 0 ? ' active' : ''}`}>
          {label}
        </a>
      ))}
    </nav>
  );
}
