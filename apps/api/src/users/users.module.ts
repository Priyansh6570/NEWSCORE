import { Module, type OnModuleInit } from '@nestjs/common';
import { MongoService } from '../database/mongo.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UsersService } from './users.service';
import { USER_MODEL, UserSchema } from './user.schema';

/**
 * Users OF a tenant. Minimal for now (find-or-create on OTP login); the full
 * profile/admin surface arrives in the dedicated users phase — see CLAUDE.md §12.
 */
@Module({
  imports: [TenancyModule],
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
