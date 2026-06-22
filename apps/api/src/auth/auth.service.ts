import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
import type { UserDoc } from '../users/user.schema';
import { OtpService } from './otp.service';
import { RefreshTokenService } from './refresh-token.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Public-safe view of a user (never the raw Mongoose document). */
export interface UserView {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  roleIds: string[];
  status: UserDoc['status'];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly users: UsersService,
    private readonly refresh: RefreshTokenService,
    private readonly jwt: JwtService,
    private readonly notifications: NotificationsService,
    private readonly ctx: TenantContextService,
  ) {}

  /**
   * Request an OTP. ALWAYS resolves without revealing whether the phone maps to
   * an existing user — we generate + send a code regardless of account existence.
   */
  async requestOtp(phone: string): Promise<void> {
    // Store the code (in Redis, via OtpService) FIRST, then hand it to delivery.
    const code = await this.otp.generate(phone);
    await this.notifications.sendOtp(phone, code);
  }

  /** Verify an OTP; find-or-create the reader, then mint a token pair. */
  async verifyOtp(phone: string, code: string): Promise<TokenPair> {
    const ok = await this.otp.verify(phone, code);
    if (!ok) throw new UnauthorizedException('Invalid or expired code');

    const user = await this.users.findOrCreateByPhone(phone);
    if (user.status === 'blocked') throw new ForbiddenException('Account is blocked');

    return this.issueTokens(user);
  }

  /** Rotate a refresh token into a fresh access + refresh pair. */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const { refresh, userId } = await this.refresh.rotate(refreshToken);
    const user = await this.users.findById(userId);
    if (!user || user.status === 'blocked') {
      throw new UnauthorizedException('User no longer active');
    }
    return { accessToken: await this.signAccess(user), refreshToken: refresh };
  }

  async logout(userId: string): Promise<void> {
    await this.refresh.revokeAllForUser(userId);
  }

  async me(userId: string): Promise<UserView> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.toView(user);
  }

  private async issueTokens(user: UserDoc): Promise<TokenPair> {
    const accessToken = await this.signAccess(user);
    const refreshToken = await this.refresh.issue(String(user._id));
    return { accessToken, refreshToken };
  }

  private async signAccess(user: UserDoc): Promise<string> {
    // tid binds the token to this tenant; JwtAuthGuard rejects cross-tenant use.
    return this.jwt.signAsync({ sub: String(user._id), tid: this.ctx.tenantId });
  }

  private toView(user: UserDoc): UserView {
    return {
      id: String(user._id),
      name: user.name,
      phone: user.phone,
      email: user.email,
      roleIds: user.roleIds.map((r) => String(r)),
      status: user.status,
    };
  }
}
