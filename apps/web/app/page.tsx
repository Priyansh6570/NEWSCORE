import { TenantSwitcher } from '../components/site/controls';
import { Footer } from '../components/site/Footer';
import { Masthead } from '../components/site/Masthead';
import { SectionNav } from '../components/site/SectionNav';
import { Stories } from '../components/site/Stories';
import { TopBar } from '../components/site/TopBar';
import { getHomeContent } from '../lib/content/home';
import { getRequestContext } from '../lib/tenant/request-context';
import { listTenantSlugs } from '../lib/tenant/site-config';

/**
 * Phase F-Foundation proof surface: masthead + a few hairline-ruled story rows +
 * footer, rebuilt as React faithful to home-A. It exists to PROVE the theming
 * architecture, not to be the finished homepage:
 *   • edit a value in app/styles/tokens.css (e.g. --accent) -> the whole surface
 *     reskins (single-source default path);
 *   • switch tenant (the dev chips below, or a Host) -> masthead/footer/title/
 *     meta reskin with NO component edits (runtime white-label path);
 *   • ?lang=hi -> the same markup re-typesets in Devanagari via :lang().
 */
export default async function HomePage() {
  const { locale } = await getRequestContext();
  const content = getHomeContent(locale);

  return (
    <>
      <TopBar content={content} />
      <Masthead content={content} />
      <SectionNav content={content} />
      {/* DEV-ONLY: prove the per-tenant reskin path in a single browser. */}
      <TenantSwitcher tenants={listTenantSlugs()} />
      <main className="wrap">
        <Stories content={content} />
      </main>
      <Footer content={content} />
    </>
  );
}
