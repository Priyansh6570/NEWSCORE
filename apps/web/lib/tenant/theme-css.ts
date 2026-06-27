import type { PublicSiteConfig, ThemeTokens } from './site-config';

/**
 * Map a tenant's SiteConfig `theme` (the small, admin-editable token shape) onto
 * the rich editorial CSS custom properties defined in app/styles/tokens.css.
 *
 * We map ONLY colors + radii here. Fonts are deliberately left to the
 * script-resilient `:lang()` system in tokens.css — a tenant override on `:root`
 * would otherwise clobber the per-script font remaps. Per-tenant fonts are a
 * future extension (they'd need their own non-`:lang` variables).
 *
 * The default values in tokens.css are themselves a complete brand, so a tenant
 * that overrides nothing still renders correctly.
 */
/** Drop empty values. An empty token means "inherit the platform default" from
 *  tokens.css — so a tenant adopting the default brand emits NO override, and
 *  editing tokens.css visibly reskins it (proof path a). */
function compact(vars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(vars).filter(([, v]) => v && v.trim() !== ''));
}

function lightVars(theme: ThemeTokens): Record<string, string> {
  const c = theme.colors;
  return compact({
    '--paper': c.bg,
    '--paper-2': c.surface,
    '--surface': c.surface,
    '--ink': c.ink,
    '--ink-strong': c.ink,
    '--line': c.border,
    '--line-soft': c.border,
    '--line-ink': c.ink,
    '--accent': c.accent,
    '--accent-deep': c.primary,
    '--r-sm': theme.radius.sm,
    '--r-md': theme.radius.md,
    '--r-lg': theme.radius.lg,
  });
}

/**
 * In dark mode we keep the legible built-in dark paper/ink (the tenant only
 * ships a light palette in this model) but carry the tenant's brand ACCENT
 * through so dark mode still feels on-brand.
 */
function darkVars(theme: ThemeTokens): Record<string, string> {
  return compact({
    '--accent': theme.colors.accent,
    '--accent-deep': theme.colors.primary,
  });
}

/** Emit a rule, or '' when there's nothing to override (keeps the default-brand
 *  tenant from shadowing tokens.css with an empty `:root{}`). */
function block(selector: string, vars: Record<string, string>): string {
  const entries = Object.entries(vars);
  if (entries.length === 0) return '';
  const body = entries.map(([k, v]) => `${k}:${v};`).join('');
  return `${selector}{${body}}`;
}

/**
 * Build the CSS string injected into <head> before paint to skin the request's
 * tenant. Light overrides target `:root` (0,1,0); the dark block in tokens.css
 * uses `:root[data-theme="dark"]` (0,2,0) so it always outranks these, leaving
 * dark paper/ink intact while the tenant dark-accent block (also
 * `:root[data-theme="dark"]`, emitted later) wins on accent by source order.
 */
export function buildTenantThemeCss(config: PublicSiteConfig): string {
  const { theme } = config;
  return (
    block(':root', lightVars(theme)) +
    block(':root[data-theme="dark"]', darkVars(theme)) +
    (config.customCss ? `\n${config.customCss}` : '')
  );
}
