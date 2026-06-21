import { ConflictException, ForbiddenException } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { startIntDb, TEST_DB_NAME, type IntDb } from '../test/int-db';
import { USER_MODEL, UserSchema, type UserDoc } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { ROLE_MODEL, RoleSchema, type RoleDoc } from './role.schema';
import { RbacService } from './rbac.service';
import { PERMISSIONS, SUPER_ADMIN_ROLE_NAME } from './permissions';

/**
 * Real-Mongo integration specs for the two security-critical IAM invariants
 * (CLAUDE.md §10): an actor can never grant a permission they don't hold (on role
 * create/edit AND on user role assignment), and the LAST active Super Admin can
 * never be demoted (deactivated or stripped of the role) — the lockout guard.
 * These live in the service logic, so we run them against an actual MongoDB.
 */
describe('IAM guards (integration, real Mongo)', () => {
  let db: IntDb;
  let rbac: RbacService;
  let users: UsersService;

  beforeAll(async () => {
    db = await startIntDb([
      [ROLE_MODEL, RoleSchema],
      [USER_MODEL, UserSchema],
    ]);
    rbac = new RbacService(db.mongo, db.ctx);
    users = new UsersService(db.mongo, db.ctx, rbac);
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset(ROLE_MODEL);
    await db.reset(USER_MODEL);
  });

  const roleModel = (): Model<RoleDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<RoleDoc>(ROLE_MODEL);
  const userModel = (): Model<UserDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<UserDoc>(USER_MODEL);

  function seedRole(
    over: Partial<RoleDoc> & { name: string; permissions: RoleDoc['permissions'] },
  ): Promise<RoleDoc> {
    return roleModel().create({ isSystem: false, ...over });
  }

  function seedUser(over: Partial<UserDoc> & { name: string }): Promise<UserDoc> {
    return userModel().create({ status: 'active', roleIds: [], ...over });
  }

  /** Seed the locked Super Admin role (full catalog) the way provisioning does. */
  function seedSuperAdminRole(): Promise<RoleDoc> {
    return seedRole({
      name: SUPER_ADMIN_ROLE_NAME,
      permissions: [...PERMISSIONS],
      isSystem: true,
    });
  }

  // ── Privilege escalation: role create/edit ────────────────────────────────

  describe('role escalation', () => {
    it('blocks creating a role with a permission the actor does NOT hold', async () => {
      const editorRole = await seedRole({
        name: 'Editor',
        permissions: ['article:create', 'article:edit', 'article:publish'],
      });
      const actor = await seedUser({ name: 'Editor User', roleIds: [editorRole._id] });

      await expect(
        rbac.create({ name: 'Sneaky', permissions: ['user:manage'] }, actor._id.toString()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows creating a role limited to permissions the actor DOES hold', async () => {
      const editorRole = await seedRole({
        name: 'Editor',
        permissions: ['article:create', 'article:edit', 'article:publish'],
      });
      const actor = await seedUser({ name: 'Editor User', roleIds: [editorRole._id] });

      const created = await rbac.create(
        { name: 'Junior', permissions: ['article:create'] },
        actor._id.toString(),
      );
      expect(created.permissions).toEqual(['article:create']);
      expect(created.isSystem).toBe(false);
    });

    it('a Super Admin actor can grant anything (its role carries the full catalog)', async () => {
      const sa = await seedSuperAdminRole();
      const actor = await seedUser({ name: 'Owner', roleIds: [sa._id] });

      const created = await rbac.create(
        { name: 'Power', permissions: ['user:manage', 'role:manage', 'settings:edit'] },
        actor._id.toString(),
      );
      expect(created.permissions).toContain('user:manage');
    });

    it('refuses to edit or delete the locked Super Admin role', async () => {
      const sa = await seedSuperAdminRole();
      const owner = await seedUser({ name: 'Owner', roleIds: [sa._id] });

      await expect(
        rbac.update(sa._id.toString(), { name: 'Renamed' }, owner._id.toString()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(rbac.remove(sa._id.toString())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to delete a role still assigned to a user', async () => {
      const role = await seedRole({ name: 'Editor', permissions: ['article:create'] });
      await seedUser({ name: 'Holder', roleIds: [role._id] });

      await expect(rbac.remove(role._id.toString())).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ── Privilege escalation: user role assignment ────────────────────────────

  describe('user role-assignment escalation', () => {
    it('blocks assigning a role that grants a permission the actor lacks', async () => {
      const editorRole = await seedRole({
        name: 'Editor',
        permissions: ['article:create', 'article:publish'],
      });
      const adminRole = await seedRole({
        name: 'User Admin',
        permissions: ['user:view', 'user:manage'],
      });
      const actor = await seedUser({ name: 'Editor User', roleIds: [editorRole._id] });
      const target = await seedUser({ name: 'Target', phone: '+15550003333' });

      await expect(
        users.update(
          target._id.toString(),
          { roleIds: [adminRole._id.toString()] },
          actor._id.toString(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows assigning a role whose permissions the actor holds', async () => {
      const adminRole = await seedRole({
        name: 'User Admin',
        permissions: ['user:view', 'user:manage'],
      });
      const actor = await seedUser({ name: 'Admin', roleIds: [adminRole._id] });
      const target = await seedUser({ name: 'Target', phone: '+15550003333' });

      const updated = await users.update(
        target._id.toString(),
        { roleIds: [adminRole._id.toString()] },
        actor._id.toString(),
      );
      expect(updated.roles.map((r) => r.name)).toEqual(['User Admin']);
    });
  });

  // ── Lockout: the last active Super Admin ──────────────────────────────────

  describe('last-Super-Admin lockout', () => {
    it('refuses to deactivate the only Super Admin', async () => {
      const sa = await seedSuperAdminRole();
      const only = await seedUser({ name: 'Owner', phone: '+15550001111', roleIds: [sa._id] });

      await expect(users.deactivate(only._id.toString())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses to strip the Super Admin role from the only Super Admin', async () => {
      const sa = await seedSuperAdminRole();
      const owner = await seedUser({ name: 'Owner', phone: '+15550001111', roleIds: [sa._id] });

      await expect(
        users.update(owner._id.toString(), { roleIds: [] }, owner._id.toString()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows deactivating one Super Admin when another active one remains', async () => {
      const sa = await seedSuperAdminRole();
      const first = await seedUser({ name: 'Owner A', phone: '+15550001111', roleIds: [sa._id] });
      await seedUser({ name: 'Owner B', phone: '+15550002222', roleIds: [sa._id] });

      const updated = await users.deactivate(first._id.toString());
      expect(updated.status).toBe('blocked');
    });
  });
});
