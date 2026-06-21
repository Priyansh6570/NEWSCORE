import { Module, type OnModuleInit } from '@nestjs/common';
import { MongoService } from '../database/mongo.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StorageService } from './storage.service';
import { MEDIA_MODEL, MediaSchema } from './media.schema';

/**
 * Media — R2-backed storage for images, e-paper PDFs, and audio (CLAUDE.md §6.3).
 * Server-side validation + sharp processing live in the service; bytes go to a
 * shared R2 bucket under a per-tenant key prefix. Video/Bunny is a separate step.
 */
@Module({
  imports: [TenancyModule],
  controllers: [MediaController],
  providers: [StorageService, MediaService],
  exports: [MediaService],
})
export class MediaModule implements OnModuleInit {
  constructor(private readonly mongo: MongoService) {}

  // Register the Media schema once so every tenant connection gets the model.
  onModuleInit(): void {
    this.mongo.registerTenantModel(MEDIA_MODEL, MediaSchema);
  }
}
