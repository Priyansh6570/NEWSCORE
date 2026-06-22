import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_OPTIONAL_AUTH_KEY } from './optional-auth.decorator';

type MutableRequest = { headers: { authorization?: string }; user?: unknown };

function makeContext(req: MutableRequest): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard — cross-tenant rejection', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let jwt: { verifyAsync: jest.Mock };
  let ctx: { tenantId: string };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) }; // not public by default
    jwt = { verifyAsync: jest.fn() };
    ctx = { tenantId: 'tenant-A' };
    guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      jwt as unknown as JwtService,
      ctx as unknown as TenantContextService,
    );
  });

  it('accepts a token whose tid matches the host-resolved tenant and sets req.user', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', tid: 'tenant-A' });
    const req: MutableRequest = { headers: { authorization: 'Bearer good.token' } };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'user-1', tenantId: 'tenant-A' });
  });

  it('rejects a token minted for a different tenant', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', tid: 'tenant-A' });
    ctx.tenantId = 'tenant-B'; // host resolved to a different tenant
    const req: MutableRequest = { headers: { authorization: 'Bearer cross.tenant.token' } };

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(req.user).toBeUndefined();
  });

  it('rejects when the token fails verification (bad/expired)', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const req: MutableRequest = { headers: { authorization: 'Bearer expired.token' } };

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('allows a @Public() route through without a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true); // route marked public
    const req: MutableRequest = { headers: {} }; // no Authorization header

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });
});

describe('JwtAuthGuard — @OptionalAuth (the paywall boundary)', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let jwt: { verifyAsync: jest.Mock };
  let ctx: { tenantId: string };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    // not public, but optional-auth: true only for IS_OPTIONAL_AUTH_KEY.
    reflector = {
      getAllAndOverride: jest.fn((key: string) => key === IS_OPTIONAL_AUTH_KEY),
    };
    jwt = { verifyAsync: jest.fn() };
    ctx = { tenantId: 'tenant-A' };
    guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      jwt as unknown as JwtService,
      ctx as unknown as TenantContextService,
    );
  });

  it('serves anonymously (no 401) when no token is present', async () => {
    const req: MutableRequest = { headers: {} };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('degrades to anonymous (no 401) on a stale/invalid token', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const req: MutableRequest = { headers: { authorization: 'Bearer stale.token' } };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('degrades to anonymous on a cross-tenant token — never authenticates it', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', tid: 'tenant-OTHER' });
    const req: MutableRequest = { headers: { authorization: 'Bearer cross.tenant.token' } };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined(); // not attached → treated as a non-subscriber
  });

  it('attaches the user when a valid same-tenant token is present', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', tid: 'tenant-A' });
    const req: MutableRequest = { headers: { authorization: 'Bearer good.token' } };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'user-1', tenantId: 'tenant-A' });
  });
});
