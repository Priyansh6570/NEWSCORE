import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { TenantContext } from '../tenancy/tenant-context';

/** Inputs needed to derive a safe origin — kept header-shaped for easy testing. */
export interface OriginInputs {
  xForwardedHost?: string;
  host?: string;
  xForwardedProto?: string;
  protocol?: string;
  domains: string[];
}

const firstValue = (v: unknown): string => String(v ?? '').split(',')[0]!.trim();

/**
 * Derive the tenant's public origin, NOT trusting the request host.
 *
 * SECURITY: a forged Host / X-Forwarded-Host would otherwise be reflected into a
 * cached, crawler-facing document (cache poisoning) and balloon the cache key
 * space. We accept the request host ONLY if it is one of the resolved tenant's
 * known domains; otherwise we fall back to the tenant's CANONICAL domain
 * (domains[0]) over https. Proxy scheme/host headers are honoured only for an
 * already-validated host.
 */
export function resolveOrigin(input: OriginInputs): string {
  const reqHost = (firstValue(input.xForwardedHost) || firstValue(input.host)).toLowerCase();
  const hostNoPort = reqHost.split(':')[0] ?? '';

  if (hostNoPort && input.domains.includes(hostNoPort)) {
    const proto = firstValue(input.xForwardedProto) || input.protocol || 'http';
    return `${proto}://${reqHost}`;
  }

  const canonical = input.domains[0];
  if (canonical) return `https://${canonical}`;

  // No domains on record (shouldn't happen post-resolution) — minimal fallback.
  return reqHost ? `https://${reqHost}` : '';
}

/**
 * The tenant's public origin (`scheme://host[:port]`) for THIS request — used to
 * build the absolute URLs in sitemaps/feeds. The tenant's known domains are read
 * from req.tenant (set by TenantMiddleware), so the host is validated, never
 * trusted verbatim. See {@link resolveOrigin}.
 */
export const RequestOrigin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request & { tenant?: TenantContext }>();
    return resolveOrigin({
      xForwardedHost: req.headers['x-forwarded-host'] as string | undefined,
      host: req.headers.host,
      xForwardedProto: req.headers['x-forwarded-proto'] as string | undefined,
      protocol: req.protocol,
      domains: req.tenant?.domains ?? [],
    });
  },
);
