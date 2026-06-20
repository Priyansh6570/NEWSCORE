import { IsString, Matches, Length } from 'class-validator';

// E.164-ish: optional leading +, 7–15 digits. Tightened per-tenant later if needed.
const PHONE_RE = /^\+?[0-9]{7,15}$/;

export class RequestOtpDto {
  @IsString()
  @Matches(PHONE_RE, { message: 'phone must be a valid phone number' })
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(PHONE_RE, { message: 'phone must be a valid phone number' })
  phone!: string;

  @IsString()
  @Length(4, 8)
  code!: string;
}

export class RefreshDto {
  @IsString()
  @Length(1, 512)
  refreshToken!: string;
}
