import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantSlug } from './lib/tenant/site-config';

/**
 * Resolve the tenant from the request Host (CLAUDE.md §5.2) and forward it,
 * plus the chosen locale/theme, to server components via request headers.
 *
 * Dev-only query overrides make local work easy without subdomains or restarts:
 *   ?tenant=indus   pick a tenant in one browser (proves per-tenant reskin)
 *   ?lang=hi        render in Hindi (proves the :lang() type system carries over)
 *   ?theme=dark     render dark
 * In production only the Host decides the tenant; `?tenant` is ignored unless it
 * names a known tenant, and real locale/theme will move to cookies.
 */
export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');

  const tenantSlug = resolveTenantSlug(host, url.searchParams.get('tenant'));

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-tenant-slug', tenantSlug);

  const lang = url.searchParams.get('lang');
  if (lang) requestHeaders.set('x-locale', lang);

  const theme = url.searchParams.get('theme');
  if (theme) requestHeaders.set('x-theme', theme);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Skip static assets and Next internals; run on real page requests.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
