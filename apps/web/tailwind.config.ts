import type { Config } from 'tailwindcss';

/**
 * Tailwind is mapped ONTO the single-source token layer (app/styles/tokens.css).
 * Every utility here resolves to a `var(--token)` — there are NO literal colors,
 * fonts, or sizes in this file. A component may therefore use a token-mapped
 * utility (e.g. `text-ink`, `bg-paper`, `font-display`) and it will track the
 * active theme + tenant override automatically. See apps/web/CLAUDE.md.
 *
 * Preflight is OFF: the ported editorial reset in app/styles/editorial.css is the
 * authoritative base (matches the design bundle), so Tailwind must not fight it.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        'ink-strong': 'var(--ink-strong)',
        'ink-soft': 'var(--ink-soft)',
        'ink-mute': 'var(--ink-mute)',
        'ink-faint': 'var(--ink-faint)',
        line: 'var(--line)',
        'line-soft': 'var(--line-soft)',
        'line-ink': 'var(--line-ink)',
        accent: 'var(--accent)',
        'accent-deep': 'var(--accent-deep)',
        'accent-soft': 'var(--accent-soft)',
        live: 'var(--live)',
        premium: 'var(--premium)',
        'premium-soft': 'var(--premium-soft)',
        'on-accent': 'var(--on-accent)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        ui: 'var(--font-ui)',
      },
      fontSize: {
        masthead: 'var(--fs-masthead)',
        lead: 'var(--fs-lead)',
        h1: 'var(--fs-h1)',
        h2: 'var(--fs-h2)',
        h3: 'var(--fs-h3)',
        h4: 'var(--fs-h4)',
        lede: 'var(--fs-lede)',
        body: 'var(--fs-body)',
        small: 'var(--fs-small)',
        meta: 'var(--fs-meta)',
        micro: 'var(--fs-micro)',
      },
      lineHeight: {
        display: 'var(--lh-display)',
        head: 'var(--lh-head)',
        body: 'var(--lh-body)',
      },
      letterSpacing: {
        display: 'var(--ls-display)',
        head: 'var(--ls-head)',
      },
      borderRadius: {
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        pill: 'var(--r-pill)',
      },
      borderWidth: {
        rule: 'var(--rule)',
        'rule-strong': 'var(--rule-strong)',
      },
      spacing: {
        s1: 'var(--s-1)',
        s2: 'var(--s-2)',
        s3: 'var(--s-3)',
        s4: 'var(--s-4)',
        s5: 'var(--s-5)',
        s6: 'var(--s-6)',
        s7: 'var(--s-7)',
        s8: 'var(--s-8)',
        s9: 'var(--s-9)',
        s10: 'var(--s-10)',
        gutter: 'var(--gutter)',
      },
      maxWidth: {
        page: 'var(--page)',
        measure: 'var(--measure)',
      },
      boxShadow: {
        band: 'var(--shadow-band)',
      },
      transitionTimingFunction: {
        editorial: 'var(--ease)',
      },
    },
  },
  plugins: [],
};

export default config;
