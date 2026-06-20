import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, type TokenPair, type UserView } from './auth.service';
import { CurrentUser, type AuthUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { RefreshDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Always 200 — never reveals whether the phone maps to an existing account. */
  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() dto: RequestOtpDto): Promise<{ ok: true }> {
    await this.auth.requestOtp(dto.phone);
    return { ok: true };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<TokenPair> {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.auth.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    await this.auth.logout(user.id);
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<UserView> {
    return this.auth.me(user.id);
  }
}
