# apps/web — Public Website · Conventions

The white-label public site (Next.js App Router). Read this **and** the root
`CLAUDE.md` before working here. This file is the contract for how theming,
branding, and i18n work in `apps/web`. The design-review agent reads it too.

> Phase F-Foundation built the **theming architecture only** — masthead + a few
> hairline-ruled story rows as a proof surface. Real pages/blocks come later.

---

## 1. The one rule: token-only styling

Components reference **only** `var(--token)` or a **token-mapped Tailwind class**
(e.g. `text-ink`, `bg-paper`, `font-display`, `rounded-md`). **Never** a hardcoded
hex, font family, brand string, or magic size in a component, page title, or meta.

- Token source of truth: **`app/styles/tokens.css`** — the default editorial brand
  (warm ivory paper · warm ink · one vermilion accent). It defines every color,
  the full type scale, spacing (8px), hairline rule weights, radii, motion, the
  dark overrides, and the script `:lang()` remaps. Edit a value here → the whole
  app reskins. This is **proof path (a)**.
- `tailwind.config.ts` maps utilities onto those same `var(--token)`s and has **no
  literal values**. Tailwind `preflight` is **off**; `app/styles/editorial.css` is
  the authoritative reset/base (ported from the design bundle, all `var()`).
- The only place literal colors are allowed is **tenant data**
  (`lib/tenant/site-config.ts`) — that's content, not code. The canary
  (`grep -ri "varta" app components`) and a hex scan must stay clean in
  `app/` + `components/`.

## 2. Brand is tenant data, never a literal

Brand **name** and **logo** render **only** from the active tenant's SiteConfig via
the single provider (`components/config-provider.tsx` → `useBrand()` / `useSiteConfig()`).
`<title>` and `<meta>` come from `generateMetadata()` reading the same config.
Swapping the tenant must reskin masthead, footer, title, and meta with **zero**
component edits. Don't reintroduce a brand string anywhere in `app/`/`components/`.

## 3. Runtime white-label (per-tenant, flash-free)

The two-layer model:

1. **Default tokens** (`tokens.css`) — the platform brand, always present.
2. **Tenant override** — `components/tenant-theme-style.tsx` renders the active
   tenant's brand tokens as an inline `<style id="tenant-theme">` in `<head>`,
   **server-rendered before paint** (no flash). Mapping lives in
   `lib/tenant/theme-css.ts` (the small backend `ThemeTokens` shape → the rich
   CSS vars). This is **proof path (b)**.

Conventions baked into the mapping:

- Override only **colors + radii**. **Fonts are owned by the `:lang()` system** —
  never override font tokens at `:root` or you'll clobber the per-script remaps.
- An **empty** token value means "inherit the default" — so a tenant adopting the
  platform brand emits no override and `tokens.css` drives it (keeps path (a) honest).
- Dark mode: `tokens.css` scopes dark to `:root[data-theme="dark"]` (specificity
  0,2,0) so it always outranks a tenant's light `:root` override (0,1,0). The
  tenant's brand **accent** is carried into dark; paper/ink stay legible defaults.

`SiteConfig` is **mocked** for now (`lib/tenant/site-config.ts`) to match the
backend's `PublicSiteConfigView`. Next phase: replace `fetchSiteConfig` with a
cached `GET /api/v1/site-config` and move the types to `@newscore/shared`.

## 4. Tenant + locale resolution

- Tenant is resolved from the **Host** (CLAUDE.md §5.2) in `middleware.ts`, which
  forwards `x-tenant-slug` / `x-locale` / `x-theme` to server components.
  `lib/tenant/request-context.ts#getRequestContext()` reads them (works in the
  root layout, where `searchParams` is unavailable).
- **Dev overrides** (query params, dev only): `?tenant=indus` (single-browser
  tenant switch), `?lang=hi`, `?theme=dark`. Host map includes `demo.localhost`
  and `indus.localhost`; `DEV_TENANT_SLUG` pins a tenant on `localhost`.
- The tenant is **never** taken from a client-supplied body field — only Host
  (with the dev query override gated to known tenants).

## 5. Script-resilient `:lang()` type system

Same markup, any script. Setting `<html lang>` (from the resolved locale) makes the
`:lang(hi|ta|bn|ur)` blocks in `tokens.css` swap font family + line-heights
automatically; `:lang(ur)` also sets RTL. **Translated content comes from the
backend** (mocked now in `lib/content/home.ts`) — there is no UI dictionary.
Locales without content fall back to English (the script font still applies).

## 6. App Router structure

```
app/
  layout.tsx        # <html lang/dir/data-theme>, fonts, TenantThemeStyle + ThemeScript in <head>, ConfigProvider
  page.tsx          # home proof surface (server component; reads request context + content)
  globals.css       # @import tokens.css + editorial.css, then @tailwind components/utilities
  styles/           # tokens.css (single source) · editorial.css (ported base/components)
components/
  config-provider.tsx     # 'use client' — useSiteConfig / useBrand / useFeature
  tenant-theme-style.tsx  # server — injects tenant CSS vars pre-paint
  theme-script.tsx        # pre-paint inline script — restores saved light/dark
  site/                   # TopBar, Masthead, SectionNav, Stories, Footer, controls
lib/
  tenant/           # site-config (types/mock/resolution) · theme-css (mapping) · request-context
  content/          # mock localized content (stands in for backend)
middleware.ts       # Host -> tenant; forwards locale/theme headers
```

- Components that consume the provider context (`useBrand`, etc.) must be
  `'use client'`. Pass localized **content** down as props from server components;
  read **brand/locale/features** from the provider.
- `useFeature(flag)` only shows/hides chrome — the real boundary is the API guard.

## 7. Workflow

- Dev server: `pnpm --filter @newscore/web dev` → **port 3001** (kept off the API's
  4000). Verify: `pnpm --filter @newscore/web typecheck` and `... build`.
- **Commit directly to `main`** (root CLAUDE.md §13). CI runs typecheck + tests on
  push; green CI is the gate. Build sequentially on low-RAM machines.
- Before committing UI work, sanity-check both reskin paths and the canary:
  `grep -ri "varta" apps/web/app apps/web/components` must return **zero**.
