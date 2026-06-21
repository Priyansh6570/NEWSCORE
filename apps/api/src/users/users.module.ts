import { Module, type OnModuleInit } from '@nestjs/common';
import { MongoService } from '../database/mongo.service';
import { RbacModule } from '../rbac/rbac.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { USER_MODEL, UserSchema } from './user.schema';

/**
 * Users OF a tenant. Find-or-create on OTP login plus the admin management
 * surface (list/get/create/update/deactivate) with role assignment. RbacModule
 * is imported for the privilege-escalation checks. See CLAUDE.md §6.2, §10.
 */
@Module({
  imports: [TenancyModule, RbacModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule implements OnModuleInit {
  constructor(private readonly mongo: MongoService) {}

  // Register the User schema once so every tenant connection gets the model.
  onModuleInit(): void {
    this.mongo.registerTenantModel(USER_MODEL, UserSchema);
  }
}
