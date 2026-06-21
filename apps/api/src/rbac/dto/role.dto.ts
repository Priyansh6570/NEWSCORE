import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PERMISSIONS, type Permission } from '../permissions';

/**
 * Create a role: a name plus a chosen subset of the PERMISSIONS catalog. Each
 * permission is validated against the catalog (unknown strings are rejected);
 * the actor's right to grant them is checked separately in the service (§10).
 */
export class CreateRoleDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsArray()
  @ArrayUnique()
  @IsIn([...PERMISSIONS], { each: true })
  permissions!: Permission[];
}

/** Patch a role's name/description/permissions. isSystem roles are rejected in the service. */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...PERMISSIONS], { each: true })
  permissions?: Permission[];
}

/** The shape returned to clients — never a raw Mongoose document. */
export interface RoleView {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  isSystem: boolean;
}

/** The catalog grouped by resource prefix, so the admin UI can render sections. */
export interface PermissionGroupView {
  group: string; // e.g. 'article', 'user'
  permissions: Permission[];
}
