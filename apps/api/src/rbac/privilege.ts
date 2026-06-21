import { ForbiddenException } from '@nestjs/common';
import { type Connection, Types } from 'mongoose';
import { USER_MODEL, type UserDoc } from '../users/user.schema';
import { ROLE_MODEL, type RoleDoc } from './role.schema';
import type { Permission } from './permissions';

/**
 * Privilege-escalation guards (CLAUDE.md §10). The rule: an actor may never grant
 * a permission they do not themselves hold — neither by putting it on a role nor
 * by assigning a role that carries it. Enforced on role create/edit and on user
 * role assignment, on top of the coarse `role:manage` / `user:manage` guards.
 */

/** Union of every permission carried by the given roles (an actor's effective set). */
export function effectivePermissions(roles: Pick<RoleDoc, 'permissions'>[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of r.permissions) set.add(p);
  return set; // Super Admin's role carries the full catalog, so it can grant anything.
}

/** Throw unless the actor holds every permission they are trying to grant. */
export function assertCanGrant(actorPerms: Set<Permission>, requested: Permission[]): void {
  const missing = requested.filter((p) => !actorPerms.has(p));
  if (missing.length) {
    throw new ForbiddenException(`Cannot grant permissions you don't hold: ${missing.join(', ')}`);
  }
}

/**
 * Resolve an actor's effective permissions from their own roleIds, read fresh
 * from the tenant DB (never trusted from the request). The actor is always the
 * authenticated principal — escalation is judged against live data, not the token.
 */
export async function loadActorPermissions(
  db: Connection,
  actorId: string,
): Promise<Set<Permission>> {
  if (!Types.ObjectId.isValid(actorId)) throw new ForbiddenException('Unknown actor');
  const user = await db.model<UserDoc>(USER_MODEL).findById(actorId).lean<UserDoc>().exec();
  if (!user) throw new ForbiddenException('Unknown actor');
  const roles = await db
    .model<RoleDoc>(ROLE_MODEL)
    .find({ _id: { $in: user.roleIds } })
    .lean<RoleDoc[]>()
    .exec();
  return effectivePermissions(roles);
}
