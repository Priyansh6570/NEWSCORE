import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { USER_MODEL, type UserDoc } from '../users/user.schema';
import { ROLE_MODEL, type RoleDoc } from './role.schema';
import { PERMISSIONS, SUPER_ADMIN_ROLE_NAME, type Permission } from './permissions';
import {
  assertCanGrant,
  effectivePermissions,
  loadActorPermissions,
} from './privilege';
import {
  type CreateRoleDto,
  type PermissionGroupView,
  type RoleView,
  type UpdateRoleDto,
} from './dto/role.dto';

@Injectable()
export class RbacService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  private model(): Model<RoleDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<RoleDoc>(ROLE_MODEL);
  }

  /**
   * Idempotently ensure the locked Super Admin role (all permissions) exists for
   * the active tenant. Called during tenant provisioning (CLAUDE.md §14, step 6);
   * its permission list is kept in sync with the catalog on every call.
   */
  async ensureSuperAdminRole(): Promise<RoleDoc> {
    const role = await this.model()
      .findOneAndUpdate(
        { name: SUPER_ADMIN_ROLE_NAME },
        { $set: { permissions: [...PERMISSIONS], isSystem: true } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean<RoleDoc>()
      .exec();
    return role;
  }

  // ── Role management (gated on role:manage) ───────────────────────────────

  /** All roles with their permission sets, name-sorted. */
  async list(): Promise<RoleView[]> {
    const docs = await this.model().find().sort({ name: 1 }).lean<RoleDoc[]>().exec();
    return docs.map(toView);
  }

  /**
   * Create a role. The actor may only grant permissions they themselves hold
   * (anti-escalation, §10). Role names are unique within a tenant.
   */
  async create(dto: CreateRoleDto, actorId: string): Promise<RoleView> {
    const actorPerms = await this.actorPermissions(actorId);
    assertCanGrant(actorPerms, dto.permissions);
    try {
      const doc = await this.model().create({
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
        isSystem: false, // only the seeded Super Admin is ever a system role
      });
      return toView(doc.toObject());
    } catch (err) {
      throw this.rethrowDuplicate(err);
    }
  }

  /**
   * Edit a role's name/description/permissions. The locked Super Admin role
   * (isSystem) cannot be edited. Any newly assigned permissions are subject to
   * the same anti-escalation check as create.
   */
  async update(id: string, dto: UpdateRoleDto, actorId: string): Promise<RoleView> {
    const role = await this.findRole(id);
    if (role.isSystem) {
      throw new ForbiddenException('The Super Admin role is locked and cannot be edited');
    }
    if (dto.permissions) {
      const actorPerms = await this.actorPermissions(actorId);
      assertCanGrant(actorPerms, dto.permissions);
    }
    const $set: Partial<RoleDoc> = {};
    if (dto.name !== undefined) $set.name = dto.name;
    if (dto.description !== undefined) $set.description = dto.description;
    if (dto.permissions !== undefined) $set.permissions = dto.permissions;
    try {
      const updated = await this.model()
        .findByIdAndUpdate(role._id, { $set }, { new: true })
        .lean<RoleDoc>()
        .exec();
      if (!updated) throw new NotFoundException('Role not found');
      return toView(updated);
    } catch (err) {
      throw this.rethrowDuplicate(err);
    }
  }

  /**
   * Delete a role. Refused for the locked Super Admin role, and for any role
   * still assigned to at least one user (deleting it would silently strip their
   * access). The admin must reassign those users first.
   */
  async remove(id: string): Promise<void> {
    const role = await this.findRole(id);
    if (role.isSystem) {
      throw new ForbiddenException('The Super Admin role is locked and cannot be deleted');
    }
    const holders = await this.userModel().countDocuments({ roleIds: role._id }).exec();
    if (holders > 0) {
      throw new ConflictException(
        `Role is still assigned to ${holders} user(s); reassign them before deleting`,
      );
    }
    await this.model().deleteOne({ _id: role._id }).exec();
  }

  /** The static permission catalog, grouped by resource prefix for the admin UI. */
  permissionCatalog(): PermissionGroupView[] {
    const groups = new Map<string, Permission[]>();
    for (const p of PERMISSIONS) {
      const group = p.split(':')[0] ?? p;
      const bucket = groups.get(group) ?? [];
      bucket.push(p);
      groups.set(group, bucket);
    }
    return [...groups].map(([group, permissions]) => ({ group, permissions }));
  }

  // ── Helpers shared with UsersService (role assignment escalation) ─────────

  /** The active tenant's effective permissions for an actor (from their roleIds). */
  async actorPermissions(actorId: string): Promise<Set<Permission>> {
    return loadActorPermissions(this.mongo.tenant(this.ctx.dbName), actorId);
  }

  /**
   * The union of permissions carried by the given roles. Validates that every id
   * resolves to a real role (assigning a phantom roleId is a 400, not a silent
   * no-op), then returns the granted set used for the escalation check.
   */
  async permissionsForRoleIds(roleIds: string[]): Promise<Permission[]> {
    if (roleIds.length === 0) return [];
    const ids = roleIds.map((id) => {
      if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`Invalid roleId: ${id}`);
      return new Types.ObjectId(id);
    });
    const roles = await this.model().find({ _id: { $in: ids } }).lean<RoleDoc[]>().exec();
    if (roles.length !== new Set(roleIds).size) {
      throw new BadRequestException('One or more roleIds do not exist');
    }
    return [...effectivePermissions(roles)];
  }

  private async findRole(id: string): Promise<RoleDoc> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Role not found');
    const role = await this.model().findById(id).lean<RoleDoc>().exec();
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private userModel(): Model<UserDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<UserDoc>(USER_MODEL);
  }

  /** Map a duplicate-key (E11000) on the unique name index to a 409. */
  private rethrowDuplicate(err: unknown): Error {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      return new ConflictException('A role with that name already exists');
    }
    return err as Error;
  }
}

/** Map a lean Role document to the RoleView. Never leak raw docs. */
function toView(doc: RoleDoc): RoleView {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    permissions: doc.permissions,
    isSystem: doc.isSystem,
  };
}
