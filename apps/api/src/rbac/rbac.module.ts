import { Module, type OnModuleInit } from '@nestjs/common';
import { MongoService } from '../database/mongo.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PermissionsGuard } from './permissions.guard';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { ROLE_MODEL, RoleSchema } from './role.schema';

/**
 * Role-based access control. Permissions are a fixed catalog (permissions.ts);
 * roles are tenant data. PermissionsGuard is exported for global registration.
 * See CLAUDE.md §10.
 */
@Module({
  imports: [TenancyModule],
  controllers: [RbacController],
  providers: [RbacService, PermissionsGuard],
  exports: [RbacService, PermissionsGuard],
})
export class RbacModule implements OnModuleInit {
  constructor(private readonly mongo: MongoService) {}

  onModuleInit(): void {
    this.mongo.registerTenantModel(ROLE_MODEL, RoleSchema);
  }
}
