# NewsCore — Multi-Tenant News Platform · Build Blueprint

> Working codename: **NewsCore**. The client-facing brand is fully config-driven, so this
> name is internal and can be renamed at any time. Nothing in the code depends on it.

This file is the source of truth for the project. Read it at the start of every session.
It defines what we are building, the architecture, the data model, and the conventions all
generated code must follow.

---

## 1. What we are building

A multi-tenant, white-label digital news platform. **One codebase serves many newspaper
tenants**, each with its own domain, branding, content, services credentials, and fully
isolated data. Deliverables, in order: the backend API, the public website, the admin/CMS,
and later a mobile app.

We build **backend-first**. The API is the contract; the website and app are consumers.

---

## 2. Non-negotiable principles

1. **One codebase, deployed once. Never fork per client.** A bug fixed once is fixed for all.
2. **A tenant = one newspaper.** It is resolved on every request from the request host.
3. **Per-client variation lives in configuration, data, feature flags, and opt-in extension
   points — never in divergent code.**
4. **Tenant isolation is structural:** each tenant has its own database. Code is never the
   only thing standing between two clients' data.
5. **Design is componentized:** components → blocks → templates. Page layout is data.
6. **Every admin capability is a permission; roles are data** the admin can create and edit.
7. **Validate all input, trust nothing from the client, scope every query to the tenant.**
8. **Nothing client-specific is ever hardcoded** — no brand name, color, or copy as a literal.

---

## 3. Tech stack (finalized)

- **Tooling:** Node.js 22 LTS · TypeScript (strict) · pnpm · Turborepo · Git/GitHub · Docker · GitHub Actions
- **Backend:** NestJS · Mongoose · MongoDB Atlas (database-per-tenant) · Atlas Search · Redis (Upstash) · BullMQ · JWT + refresh rotation + OTP · class-validator/class-transformer · zod (env) · Swagger · pino · sharp
- **Frontend:** Next.js (App Router) · React · Tailwind CSS (CSS-variable theme tokens) · shadcn/ui (admin) · TanStack Query · React Hook Form + zod · next-intl · TipTap (editor) · Recharts
- **Media & delivery:** Cloudflare R2 + CDN (images, PDFs, audio) · Bunny Stream (video, reels) · Cloudflare for SaaS (per-tenant domains + TLS)
- **Comms & payments:** Resend · MSG91 (SMS/OTP + DLT) · Firebase Cloud Messaging · Razorpay (per-tenant keys)
- **Infra:** Web on Vercel · API + workers on Render/Railway/Fly or a VPS (Docker + Caddy) · Cloudflare DNS/CDN/WAF · Sentry
- **Mobile (later):** React Native (Expo), reusing `packages/shared` and the same API

---

## 4. Monorepo layout

```
newscore/
├─ apps/
│  ├─ api/                     # NestJS backend — the contract
│  │  └─ src/
│  │     ├─ main.ts
│  │     ├─ app.module.ts
│  │     ├─ common/            # guards, interceptors, filters, decorators, pipes
│  │     ├─ config/            # env schema (zod), app config
│  │     ├─ platform/          # tenant registry + provisioning (PLATFORM db)
│  │     ├─ tenancy/           # host->tenant resolver, request context, db switching
│  │     ├─ auth/              # OTP + JWT + refresh
│  │     ├─ rbac/              # permission catalog, roles, RequirePermissions guard
│  │     ├─ users/
│  │     ├─ site-config/       # white-label: branding, theme, layouts, feature flags
│  │     ├─ media/             # R2 + Bunny
│  │     ├─ notifications/     # email/sms/push abstractions + BullMQ queues
│  │     └─ modules/           # feature modules: content, taxonomy, search, engagement...
│  ├─ web/                     # Next.js public website
│  └─ admin/                   # Next.js admin/CMS (separate app; same UI package)
├─ packages/
│  ├─ shared/                  # TS types/DTOs shared api<->web (SiteConfig, Block, permissions)
│  ├─ ui/                      # design system: components + blocks + block registry
│  └─ tokens/                  # base theme-token defaults and template presets
├─ turbo.json
├─ pnpm-workspace.yaml
└─ CLAUDE.md
```

---

## 5. Multi-tenancy model

### 5.1 Two database tiers, one Atlas cluster

- **Platform DB** (one, shared): the registry of tenants and platform-level super-admins.
  This is how the app knows who exists and how to route.
- **Tenant DB** (one per tenant, e.g. `tenant_client_a`): all of that newspaper's data.

### 5.2 Request resolution

Every request resolves its tenant before any business logic runs:

```
incoming request
  -> read Host header (e.g. clienta.com)
  -> look up tenant in Platform DB (cache in Redis, TTL ~60s)
  -> attach TenantContext { tenantId, slug, dbName } to the request
  -> obtain the Mongoose connection for that tenant DB
  -> all downstream models/queries run against that connection
```

The tenant is **never** taken from a client-supplied field. Only the host (or, for the admin
API, the authenticated user's tenant) decides it.

```ts
// tenancy/tenant.middleware.ts (sketch)
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenants: TenantRegistryService) {}
  async use(req: Request, _res: Response, next: NextFunction) {
    const host = (req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
      .toString().split(':')[0];
    const tenant = await this.tenants.resolveByHost(host); // cached
    if (!tenant || tenant.status !== 'active') throw new NotFoundException('Unknown tenant');
    (req as any).tenant = { tenantId: tenant._id, slug: tenant.slug, dbName: tenant.dbName };
    next();
  }
}
```

### 5.3 Tenant connection access

```ts
// tenancy/tenant-connection.factory.ts (sketch)
// Cache one Mongoose connection per tenant DB; register models lazily on it.
getTenantConnection(dbName: string): Connection {
  // base.useDb(dbName, { useCache: true }) and attach schemas
}
```

A heavy-tenant escape hatch for the future: the `Tenant` record carries an optional
`clusterId`, so a tenant can later be moved to another cluster without touching app logic.

---

## 6. Data model

### 6.1 Platform DB

```ts
interface Tenant {
  _id: ObjectId;
  slug: string;                 // 'client-a' (unique)
  name: string;                 // internal display name
  domains: string[];            // ['clienta.com','www.clienta.com'] (each unique)
  dbName: string;               // 'tenant_client_a'
  clusterId?: string;           // future sharding; null = default cluster
  storagePrefix: string;        // R2 key prefix, e.g. 'client-a/'
  bunnyLibraryId?: string;      // Bunny Stream video library
  status: 'provisioning' | 'active' | 'suspended';
  plan: string;
  createdAt: Date;
}
// indexes: slug (unique), domains (unique, multikey), status

interface PlatformAdmin {        // you and your team — manage tenants
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash: string;          // argon2
  role: 'owner' | 'staff';
  createdAt: Date;
}
```

### 6.2 Tenant DB — core collections

```ts
interface User {                 // a reader, journalist, editor, or admin OF this tenant
  _id: ObjectId;
  name: string;
  phone?: string;                // primary login (OTP)
  email?: string;
  roleIds: ObjectId[];           // effective permissions = union of these roles
  status: 'active' | 'blocked';
  createdAt: Date;
}
// indexes: phone (unique sparse), email (unique sparse), roleIds

interface Role {                 // DATA — admin can create/edit
  _id: ObjectId;
  name: string;                  // 'District Editor'
  description?: string;
  permissions: string[];         // subset of the PERMISSIONS catalog (see §10)
  isSystem: boolean;             // 'Super Admin' is system + locked
}
// index: name (unique)
```

`SiteConfig` (the white-label document) is defined in §7.

### 6.3 Tenant DB — content collections (key fields + indexes)

```ts
interface Article {
  _id: ObjectId;
  title: string;
  slug: string;                  // unique within tenant
  excerpt?: string;
  body: object;                  // rich content JSON (TipTap)
  status: 'draft' | 'review' | 'scheduled' | 'published' | 'archived';
  categoryId: ObjectId;
  tagIds: ObjectId[];
  editionIds: ObjectId[];        // districts this runs in
  authorId: ObjectId;
  coverMediaId?: ObjectId;
  mediaIds: ObjectId[];
  isBreaking: boolean;
  isFeatured: boolean;
  seo: { title?: string; description?: string; ogImage?: string };
  scheduledAt?: Date;
  publishedAt?: Date;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}
// indexes: slug (unique), { status:1, publishedAt:-1 }, categoryId, tagIds,
//          editionIds, { isBreaking:1, publishedAt:-1 } ; + an Atlas Search index on title/body/excerpt

// Outline (full schemas added as each module is built):
interface Category { _id; name; slug; parentId?: ObjectId; order: number }
interface Tag      { _id; name; slug }
interface Edition  { _id; name; slug; districtCode?: string }    // a "district edition"
interface Media    { _id; kind: 'image'|'pdf'|'audio'|'video'; key/url; bunnyVideoId?; meta }
interface Comment  { _id; articleId; userId; body; status: 'pending'|'approved'|'rejected' }
interface Plan         { _id; name; price; interval; perks }
interface Subscription { _id; userId; planId; status; razorpaySubId?; currentPeriodEnd }
interface Ad           { _id; slot; type; mediaId?; html?; startsAt; endsAt; active }
```

---

## 7. White-label configuration

One `SiteConfig` document per tenant, seeded on provisioning and editable from the admin
panel. The frontend fetches it once (server-side, cached) and applies the theme via CSS
variables. The brand name is `config.brand.name` everywhere — never a string literal.

```ts
interface ThemeTokens {
  colors: {
    primary: string; accent: string; ink: string;
    bg: string; surface: string; muted: string; border: string;
    success: string; danger: string;
  };
  typography: { fontSans: string; fontSerif: string; baseSize: string };
  radius: { sm: string; md: string; lg: string };
  logo: { light: string; dark: string; favicon: string };
}

interface SiteConfig {
  tenantId: ObjectId;
  brand:   { name: string; tagline?: string; description?: string };
  contact: { email?: string; phone?: string; address?: string };
  social:  { facebook?: string; x?: string; youtube?: string; instagram?: string };
  theme:   ThemeTokens;
  templateId: string;            // selected template preset (see §8)
  layouts: PageLayout[];         // per-page block arrangements (see §8)
  features: FeatureFlags;        // see §9
  locale:  { default: string; available: string[] };  // e.g. default 'hi', available ['hi','en']
  customCss?: string;            // per-tenant fine-tuning escape hatch
  integrations: {                // PER-TENANT credentials, encrypted at rest
    razorpay?: { keyId: string; keySecretEnc: string; webhookSecretEnc: string };
    sms?:      { senderId: string; dltTemplateId: string };
  };
}
// index: tenantId (unique)  — single document per tenant DB
```

---

## 8. Componentization → blocks → templates

The mechanism that makes "every client a different look" possible without forking.

- **Components** (`packages/ui`): atomic, presentational, prop-driven. No data fetching,
  no tenant knowledge. e.g. `ArticleCard`, `HeadlineList`, `MediaThumb`.
- **Blocks**: page sections composed from components. Each block has a stable `type`, an
  `enabled` flag, and a typed `props` object. e.g. `HeroBlock`, `CategoryGridBlock`.
- **Block registry**: maps a `BlockType` to its React component and a props schema. The
  page renderer walks the tenant's layout, looks each block up in the registry, and renders
  it — skipping disabled blocks or blocks whose feature flag is off.
- **Page layout** = an ordered `BlockConfig[]`, stored per page in `SiteConfig.layouts`.
  Rearranging a homepage is editing data, not code.
- **Template** = a named preset (default layouts + a token preset) a tenant can adopt. A new
  "look" means adding a template to the shared codebase; then *any* tenant can choose it.

```ts
type BlockType =
  | 'hero' | 'breakingTicker' | 'topStories' | 'categoryGrid'
  | 'videoRail' | 'reelsRail' | 'epaperStrip' | 'trending'
  | 'authorSpotlight' | 'adSlot' | 'newsletterCta' | 'districtSelector';

interface BlockConfig {
  id: string;
  type: BlockType;
  enabled: boolean;
  props: Record<string, unknown>;   // block-specific, validated against its schema
}

interface PageLayout {
  page: 'home' | 'category' | 'district' | 'article';
  blocks: BlockConfig[];            // ordered
}

// packages/ui/block-registry.ts (sketch)
export const blockRegistry: Record<BlockType, {
  component: React.ComponentType<any>;
  feature?: keyof FeatureFlags;     // auto-hidden if the tenant flag is off
  propsSchema: ZodSchema;
}> = { /* ... */ };
```

---

## 9. Feature flags

Per-tenant on/off switches living in `SiteConfig.features`. They gate three things: API
endpoints (a `FeatureGuard`), blocks (via the registry's `feature` key), and admin/nav UI
(a `useFeature(flag)` hook).

```ts
interface FeatureFlags {
  comments: boolean; epaper: boolean; videos: boolean; reels: boolean;
  audioBulletins: boolean; subscriptions: boolean; paywall: boolean;
  ads: boolean; newsletter: boolean; pushNotifications: boolean;
  personalization: boolean; multilingual: boolean;
}
```

---

## 10. RBAC — dynamic, permission-based

The permission catalog is fixed in code (the set of all powers). Roles are data: a name plus
a chosen subset of permissions. Backend guards check **permissions**, never role names, so
creating a role never needs a code change.

```ts
// rbac/permissions.ts — the master catalog
export const PERMISSIONS = [
  'article:create','article:edit','article:publish','article:delete','article:viewAll',
  'taxonomy:manage','media:upload','media:manage','comment:moderate','edition:manage',
  'epaper:manage','user:view','user:manage','role:manage','subscriber:manage',
  'ad:manage','plan:manage','analytics:view','settings:edit','message:send','seo:manage',
] as const;
export type Permission = typeof PERMISSIONS[number];

// usage on an endpoint
@RequirePermissions('article:publish')
@Post(':id/publish')
publish(/* ... */) { /* ... */ }
```

- A `Super Admin` role (all permissions) is seeded per tenant and locked (`isSystem`).
- Effective permissions for a user = union of their roles' permissions.
- Frontend uses a `can('article:publish')` helper only to show/hide UI; the real boundary is
  always the backend guard.
- `tenant:manage` (creating/provisioning tenants) is a **platform-level** permission, held by
  `PlatformAdmin`s only — not part of any tenant's roles.

---

## 11. API conventions

- Base path `/api/v1`. Version bumps for breaking changes so web + app stay stable.
- Response envelope: `{ data, meta? }` on success; `{ error: { code, message, details? } }` on failure (a global exception filter).
- Every input goes through a DTO with class-validator. Reject unknown fields.
- Pagination: cursor-based for feeds (`?cursor=&limit=`), page-based for admin tables.
- Auth: `Authorization: Bearer <access>`; refresh via rotation with theft detection.
- The tenant is resolved from host/auth context, **never** from a request field.

---

## 12. Build order

- **Phase 0 — Scaffold:** Turborepo, the four packages/apps above, env + this CLAUDE.md, accounts.
- **Phase 1 — Core (in dependency order):** config → tenancy → auth → rbac → users → site-config → media → notifications. Get these right before any feature.
- **Phase 2 — First feature end-to-end (the pattern):** Content (Article) with CRUD, publish, permissions, validation, pagination, Atlas Search.
- **Phase 3 — Remaining feature modules:** taxonomy, media-formats, search, engagement, monetisation, multilingual, SEO, analytics.
- **Phase 4 — Website** (Next.js, blocks + templates, Claude Design for the templates).
- **Phase 5 — Admin/CMS.**
- **Phase 6 — Integrations:** payments/paywall, push, e-paper pipeline, newsletters.
- **Phase 7 — Deploy.** Then the React Native app.

---

## 13. Coding conventions (all generated code follows these)

- TypeScript strict everywhere. Shared types live in `packages/shared` and are imported by both api and web.
- One NestJS module per feature. Thin controllers; logic in services; Mongoose schemas co-located in the module.
- DTOs for every request and response. Never return raw Mongoose documents.
- All data access is tenant-scoped through the tenant connection. No global/default-DB queries for tenant data.
- No hardcoded client strings, colors, or copy — read from `SiteConfig`.
- Encrypt per-tenant secrets (Razorpay, SMS) at rest; never log them.
- Tests on the paths that hurt: auth, permissions, publishing, payments (webhook signature + idempotency).
- **Git: commit directly to `main`. Do NOT create feature branches** — solo dev, no PR review, so a branch per module just adds a merge step. Push to `main`; CI (GitHub Actions) runs typecheck + tests on every push.

---

## 14. Start here (first tasks for Claude Code)

1. Initialize the Turborepo monorepo and the four workspaces in §4.
2. Set up `apps/api`: NestJS, the `config` module with a zod-validated env schema, and the Mongoose connection to the Platform DB.
3. Build `platform` (Tenant + PlatformAdmin schemas, registry service) and `tenancy` (middleware + tenant-connection factory) from §5.
4. Build `auth` (OTP + JWT + refresh) and `rbac` (permissions catalog, Role schema, guard) from §10.
5. Build `site-config` (SiteConfig schema + seed defaults) from §7–§9.
6. Write a `provisionTenant()` flow: create tenant DB, seed SiteConfig + Super Admin role + first admin user, set storage prefix + Bunny library.

Then Phase 2: the Content module as the reference pattern for everything after it.
