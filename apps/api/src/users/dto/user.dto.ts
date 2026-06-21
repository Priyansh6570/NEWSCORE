import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import type { UserStatus } from '../user.schema';

// E.164-ish: optional leading +, 7–15 digits (mirrors the auth login DTO).
const PHONE_RE = /^\+?[0-9]{7,15}$/;

/**
 * Pre-create a staff user. Login stays OTP — this only seeds the account and
 * assigns roles so the person has access on their first login. Assigning roleIds
 * grants the union of those roles' permissions, so it is escalation-checked in
 * the service against the actor's own permissions (CLAUDE.md §10).
 */
export class CreateUserDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(PHONE_RE, { message: 'phone must be a valid phone number' })
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  roleIds?: string[];
}

/**
 * Update a staff user's name, status, or role assignment. roleIds is the role-
 * assignment surface (escalation-checked); status flips active/blocked, with the
 * last-Super-Admin lockout enforced in the service.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['active', 'blocked'])
  status?: UserStatus;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  roleIds?: string[];
}

/** Page-based admin listing. */
export class UserQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/** Each user's roles, name + id, for the admin table. */
export interface UserRoleRef {
  id: string;
  name: string;
}

/** The shape returned to clients — never a raw Mongoose document. */
export interface UserView {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  status: UserStatus;
  roles: UserRoleRef[];
  createdAt: string;
}

/** A page of users, page-based (admin tables). */
export interface UserPage {
  items: UserView[];
  page: number;
  limit: number;
  total: number;
}
