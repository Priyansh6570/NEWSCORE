import { Module, type OnModuleInit } from '@nestjs/common';
import { MongoService } from '../database/mongo.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RefreshTokenService } from './refresh-token.service';
import { REFRESH_TOKEN_MODEL, RefreshTokenSchema } from './refresh-token.schema';

/**
 * The rotating refresh-token store, isolated in its own module so it can be
 * shared without a cycle: AuthModule mints/rotates tokens here, and UsersModule
 * revokes a user's family when they are blocked. Depends only on TenancyModule
 * (TenantContextService) plus the global MongoService/ConfigService — never on
 * AuthModule or UsersModule, so importing it from either is acyclic.
 */
@Module({
  imports: [TenancyModule],
  providers: [RefreshTokenService],
  exports: [RefreshTokenService],
})
export class RefreshTokenModule implements OnModuleInit {
  constructor(private readonly mongo: MongoService) {}

  onModuleInit(): void {
    this.mongo.registerTenantModel(REFRESH_TOKEN_MODEL, RefreshTokenSchema);
  }
}
