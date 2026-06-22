import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { NotificationsService } from '../notifications/notifications.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import type { UserDoc } from '../users/user.schema';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { OtpService } from './otp.service';
import type { RefreshTokenService } from './refresh-token.service';

/**
 * AuthService.refreshTokens must refuse a blocked user even when they present a
 * still-valid refresh token: the second half of the "block actually revokes
 * access" guarantee (the first half — burning the refresh family on block — is
 * covered in rbac/iam-guards.int.spec.ts). This caps a blocked user's reach at
 * the access-token TTL, since they can never rotate into a fresh one. (The first
 * half revokes ALL of the user's active tokens, across every family, not just one.)
 */
describe('AuthService.refreshTokens — status enforcement', () => {
  function build(opts: { user: UserDoc | null }): {
    auth: AuthService;
    rotate: jest.Mock;
  } {
    const rotate = jest.fn().mockResolvedValue({ refresh: 'next-refresh', userId: 'user-1' });
    const refresh = { rotate } as unknown as RefreshTokenService;
    const users = {
      findById: jest.fn().mockResolvedValue(opts.user),
    } as unknown as UsersService;
    const jwt = { signAsync: jest.fn().mockResolvedValue('access-jwt') } as unknown as JwtService;
    const ctx = { tenantId: 'tenant-1' } as unknown as TenantContextService;
    const otp = {} as OtpService;
    const notifications = {} as NotificationsService;

    const auth = new AuthService(otp, users, refresh, jwt, notifications, ctx);
    return { auth, rotate };
  }

  const activeUser = { _id: 'user-1', name: 'Staff', roleIds: [], status: 'active' } as unknown as UserDoc;
  const blockedUser = { ...activeUser, status: 'blocked' } as UserDoc;

  it('rejects a blocked user even with a valid refresh token', async () => {
    const { auth } = build({ user: blockedUser });
    await expect(auth.refreshTokens('valid-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the user no longer exists', async () => {
    const { auth } = build({ user: null });
    await expect(auth.refreshTokens('valid-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('issues a new pair for an active user', async () => {
    const { auth } = build({ user: activeUser });
    const pair = await auth.refreshTokens('valid-token');
    expect(pair).toEqual({ accessToken: 'access-jwt', refreshToken: 'next-refresh' });
  });
});
