import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { MongoService } from '../database/mongo.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { USER_MODEL, type UserDoc } from '../users/user.schema';
import { ROLE_MODEL, type RoleDoc } from './role.schema';
import { PermissionsGuard } from './permissions.guard';
import { SUPER_ADMIN_ROLE_NAME, type Permission } from './permissions';

function makeContext(userId?: string): ExecutionContext {
  const req = { user: userId ? { id: userId } : undefined };
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard — super-admin bypass + denial', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let userFinder: { lean: jest.Mock };
  let roleFinder: { lean: jest.Mock };
  let guard: PermissionsGuard;

  /** Wire MongoService.tenant().model(name) → user/role finders for this test. */
  function buildGuard(user: Partial<UserDoc> | null, roles: Partial<RoleDoc>[]): void {
    userFinder = { lean: jest.fn().mockResolvedValue(user) };
    roleFinder = { lean: jest.fn().mockResolvedValue(roles) };
    const db = {
      model: jest.fn((name: string) =>
        name === USER_MODEL
          ? { findById: jest.fn().mockReturnValue(userFinder) }
          : name === ROLE_MODEL
            ? { find: jest.fn().mockReturnValue(roleFinder) }
            : {},
      ),
    };
    const mongo = { tenant: jest.fn().mockReturnValue(db) } as unknown as MongoService;
    const ctx = { dbName: 'tenant_test' } as unknown as TenantContextService;
    guard = new PermissionsGuard(reflector as unknown as Reflector, mongo, ctx);
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
  });

  it('allows handlers that require no permissions (without hitting the DB)', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const mongo = { tenant: jest.fn() } as unknown as MongoService;
    const ctx = { dbName: 'tenant_test' } as unknown as TenantContextService;
    guard = new PermissionsGuard(reflector as unknown as Reflector, mongo, ctx);

    await expect(guard.canActivate(makeContext('user-1'))).resolves.toBe(true);
    expect(mongo.tenant).not.toHaveBeenCalled();
  });

  it('lets a locked Super Admin through regardless of required permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue(['article:publish'] as Permission[]);
    buildGuard({ roleIds: [] }, [
      { isSystem: true, name: SUPER_ADMIN_ROLE_NAME, permissions: [] },
    ]);

    await expect(guard.canActivate(makeContext('user-1'))).resolves.toBe(true);
  });

  it('allows a user whose role grants the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['article:publish'] as Permission[]);
    buildGuard({ roleIds: [] }, [
      { isSystem: false, name: 'Editor', permissions: ['article:publish'] },
    ]);

    await expect(guard.canActivate(makeContext('user-1'))).resolves.toBe(true);
  });

  it('denies a user missing the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['article:publish'] as Permission[]);
    buildGuard({ roleIds: [] }, [
      { isSystem: false, name: 'Author', permissions: ['article:edit'] },
    ]);

    await expect(guard.canActivate(makeContext('user-1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
