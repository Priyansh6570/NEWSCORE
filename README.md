# NewsCore

Multi-tenant, white-label digital news platform. One codebase serves many newspaper
tenants, each with its own domain, branding, content, and fully isolated data.

See [`CLAUDE.md`](./CLAUDE.md) for the architecture, data model, and conventions.

## Monorepo

Turborepo + pnpm. Node 22 LTS.

```
apps/
  api/      NestJS backend — the API contract
  web/      Next.js public website
  admin/    Next.js admin / CMS
packages/
  shared/   TS types & DTOs shared between api and web
  ui/       Design system: components, blocks, block registry
  tokens/   Base theme-token defaults and template presets
```

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm build
```

Copy `.env.example` to `.env` and fill in real values. Never commit secrets.
