import type { PublicSiteConfig } from '../lib/tenant/site-config';
import { buildTenantThemeCss } from '../lib/tenant/theme-css';

/**
 * Server component. Renders the active tenant's brand overrides as a <style>
 * block. Placed in <head> in the server-rendered HTML, so the tenant skin is
 * present BEFORE first paint — no flash of the default palette.
 *
 * This is the runtime half of the white-label system: tokens.css ships the
 * default brand; this injects the per-request tenant override on top.
 */
export function TenantThemeStyle({ config }: { config: PublicSiteConfig }) {
  const css = buildTenantThemeCss(config);
  return <style id="tenant-theme" dangerouslySetInnerHTML={{ __html: css }} />;
}
