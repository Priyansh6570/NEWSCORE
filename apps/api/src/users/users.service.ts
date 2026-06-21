import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { MongoService } from '../database/mongo.service';
import { RbacService } from '../rbac/rbac.service';
import { ROLE_MODEL, type RoleDoc } from '../rbac/role.schema';
import { SUPER_ADMIN_ROLE_NAME } from '../rbac/permissions';
import { assertCanGrant } from '../rbac/privilege';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { USER_MODEL, type UserDoc } from './user.schema';
import {
  type CreateUserDto,
  type UpdateUserDto,
  type UserPage,
  type UserQueryDto,
  type UserView,
} from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
    private readonly rbac: RbacService,
    private readonly refresh: RefreshTokenService,
  ) {}

  /** The User model on the active tenant's connection. */
  private model(): Model<UserDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<UserDoc>(USER_MODEL);
  }

  private roleModel(): Model<RoleDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<RoleDoc>(ROLE_MODEL);
  }

  // ── Auth-path helpers (unchanged) ────────────────────────────────────────

  /**
   * Find a user by phone, or create a default reader (no roles) if none exists.
   * Used by OTP verification — the first successful login provisions the reader.
   */
  async findOrCreateByPhone(phone: string): Promise<UserDoc> {
    const Model = this.model();
    const existing = await Model.findOne({ phone }).lean<UserDoc>().exec();
    if (existing) return existing;
    const created = await Model.create({
      name: phone, // a display name can be set later from the profile
      phone,
      roleIds: [],
      status: 'active',
    });
    return created.toObject();
  }

  async findById(id: string): Promise<UserDoc | null> {
    return this.model().findById(id).lean<UserDoc>().exec();
  }

  // ── Admin management (user:view to read / user:manage to write) ───────────

  /** Paginated user listing with each user's roles (name + id) resolved. */
  async list(q: UserQueryDto): Promise<UserPage> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const model = this.model();
    const [docs, total] = await Promise.all([
      model
        .find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<UserDoc[]>()
        .exec(),
      model.countDocuments().exec(),
    ]);
    const roleMap = await this.roleRefs(docs.flatMap((d) => d.roleIds));
    return { items: docs.map((d) => toView(d, roleMap)), page, limit, total };
  }

  /** One user with their roles resolved. */
  async getOne(id: string): Promise<UserView> {
    const user = await this.findOr404(id);
    const roleMap = await this.roleRefs(user.roleIds);
    return toView(user, roleMap);
  }

  /**
   * Pre-create a staff user with role assignments. Phone is the OTP login key, so
   * it must be unique; assigning roleIds is escalation-checked against the actor.
   */
  async create(dto: CreateUserDto, actorId: string): Promise<UserView> {
    const roleIds = dto.roleIds ?? [];
    await this.assertActorCanAssign(actorId, roleIds);
    try {
      const created = await this.model().create({
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        roleIds: roleIds.map((id) => new Types.ObjectId(id)),
        status: 'active',
      });
      const roleMap = await this.roleRefs(created.roleIds);
      return toView(created.toObject(), roleMap);
    } catch (err) {
      throw this.rethrowDuplicate(err);
    }
  }

  /**
   * Update name/status/roleIds. roleIds is the role-assignment surface — granting
   * the union of those roles' permissions, so it is escalation-checked. Any change
   * that would demote the LAST active Super Admin (deactivating them or stripping
   * the role) is refused (lockout, §10).
   */
  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<UserView> {
    const user = await this.findOr404(id);

    if (dto.roleIds) await this.assertActorCanAssign(actorId, dto.roleIds);

    const nextRoleIds = dto.roleIds
      ? dto.roleIds.map((rid) => new Types.ObjectId(rid))
      : user.roleIds;
    const nextStatus = dto.status ?? user.status;
    await this.assertNotLastSuperAdmin(user, nextRoleIds, nextStatus);

    const $set: Partial<UserDoc> = {};
    if (dto.name !== undefined) $set.name = dto.name;
    if (dto.status !== undefined) $set.status = dto.status;
    if (dto.roleIds !== undefined) $set.roleIds = nextRoleIds;

    const updated = await this.model()
      .findByIdAndUpdate(user._id, { $set }, { new: true })
      .lean<UserDoc>()
      .exec();
    if (!updated) throw new NotFoundException('User not found');
    // Blocking a user cuts off their refresh: revoke their active tokens so they
    // can't rotate a new access token (existing access token expires within its TTL).
    if (updated.status === 'blocked') await this.refresh.revokeAllForUser(id);
    const roleMap = await this.roleRefs(updated.roleIds);
    return toView(updated, roleMap);
  }

  /** Deactivate (block) a user. Refused for the last active Super Admin. */
  async deactivate(id: string): Promise<UserView> {
    const user = await this.findOr404(id);
    await this.assertNotLastSuperAdmin(user, user.roleIds, 'blocked');
    const updated = await this.model()
      .findByIdAndUpdate(user._id, { $set: { status: 'blocked' } }, { new: true })
      .lean<UserDoc>()
      .exec();
    if (!updated) throw new NotFoundException('User not found');
    // Revoke active sessions immediately — a blocked user must not be able to
    // refresh into a fresh access token.
    await this.refresh.revokeAllForUser(id);
    const roleMap = await this.roleRefs(updated.roleIds);
    return toView(updated, roleMap);
  }

  // ── Guards ───────────────────────────────────────────────────────────────

  /** An actor may only assign roles whose permissions they themselves hold. */
  private async assertActorCanAssign(actorId: string, roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) return;
    const actorPerms = await this.rbac.actorPermissions(actorId);
    const granted = await this.rbac.permissionsForRoleIds(roleIds);
    assertCanGrant(actorPerms, granted);
  }

  /**
   * Refuse a change that would leave the tenant with zero active Super Admins.
   * Triggers only when the target user is currently an active Super Admin and the
   * proposed next state (status + roleIds) drops that — i.e. the lockout case.
   *
   * The count + write are not transactional, so two concurrent demotions of the
   * last two Super Admins could theoretically both pass. Accepted for now (matches
   * the non-transactional pattern across the codebase; standalone Mongo has no
   * sessions) — revisit with a conditional write if it ever proves a problem.
   */
  private async assertNotLastSuperAdmin(
    user: UserDoc,
    nextRoleIds: Types.ObjectId[],
    nextStatus: UserDoc['status'],
  ): Promise<void> {
    const saId = await this.superAdminRoleId();
    if (!saId) return; // no Super Admin role in this tenant; nothing to protect

    const wasActiveSA = user.status === 'active' && hasRole(user.roleIds, saId);
    const willBeActiveSA = nextStatus === 'active' && hasRole(nextRoleIds, saId);
    if (!wasActiveSA || willBeActiveSA) return; // not a demotion of a Super Admin

    const activeSuperAdmins = await this.model()
      .countDocuments({ status: 'active', roleIds: saId })
      .exec();
    if (activeSuperAdmins <= 1) {
      throw new ForbiddenException('Cannot remove or deactivate the last Super Admin');
    }
  }

  private async superAdminRoleId(): Promise<Types.ObjectId | null> {
    const role = await this.roleModel()
      .findOne({ name: SUPER_ADMIN_ROLE_NAME, isSystem: true })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>()
      .exec();
    return role?._id ?? null;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findOr404(id: string): Promise<UserDoc> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('User not found');
    const user = await this.model().findById(id).lean<UserDoc>().exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Resolve a set of roleIds to an id→name map for view assembly (one query). */
  private async roleRefs(roleIds: Types.ObjectId[]): Promise<Map<string, string>> {
    if (roleIds.length === 0) return new Map();
    const roles = await this.roleModel()
      .find({ _id: { $in: roleIds } })
      .select('name')
      .lean<Array<{ _id: Types.ObjectId; name: string }>>()
      .exec();
    return new Map(roles.map((r) => [r._id.toString(), r.name]));
  }

  /** Map a duplicate-key (E11000) on the unique phone/email index to a 409. */
  private rethrowDuplicate(err: unknown): Error {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      return new ConflictException('A user with that phone or email already exists');
    }
    return err as Error;
  }
}

/** Whether a roleId list contains the given id (ObjectId equality). */
function hasRole(roleIds: Types.ObjectId[], id: Types.ObjectId): boolean {
  return roleIds.some((rid) => rid.equals(id));
}

/** Map a lean User document to the UserView, joining role names. Never leak raw docs. */
function toView(doc: UserDoc, roleMap: Map<string, string>): UserView {
  return {
    id: doc._id.toString(),
    name: doc.name,
    phone: doc.phone,
    email: doc.email,
    status: doc.status,
    roles: doc.roleIds.map((rid) => ({
      id: rid.toString(),
      name: roleMap.get(rid.toString()) ?? '(unknown role)',
    })),
    createdAt: doc.createdAt.toISOString(),
  };
}
