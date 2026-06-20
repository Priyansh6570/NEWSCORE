import { Global, Module } from '@nestjs/common';
import { MongoService } from './mongo.service';

/**
 * Global database access. Exposes a single MongoService that owns the one
 * cluster connection; platform() and tenant(dbName) views are derived from it.
 * See CLAUDE.md §5.
 */
@Global()
@Module({
  providers: [MongoService],
  exports: [MongoService],
})
export class DatabaseModule {}
