import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mongoose, { Connection, Schema } from 'mongoose';
import type { Env } from '../config/env.schema';

@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private base!: Connection; // one connection to the cluster
  private readonly tenantConns = new Map<string, Connection>();
  private readonly tenantModels: Array<[string, Schema]> = [];

  constructor(private readonly config: ConfigService<Env, true>) {}

  async onModuleInit(): Promise<void> {
    const uri = this.config.get('MONGODB_URI', { infer: true });
    this.base = await mongoose.createConnection(uri, { maxPoolSize: 20 }).asPromise();
  }

  async onModuleDestroy(): Promise<void> {
    await this.base?.close();
  }

  /** Platform DB (tenant registry, platform admins). */
  platform(): Connection {
    return this.base.useDb(this.config.get('PLATFORM_DB_NAME', { infer: true }), { useCache: true });
  }

  /** A tenant's DB — cached; tenant models registered once per connection. */
  tenant(dbName: string): Connection {
    let conn = this.tenantConns.get(dbName);
    if (!conn) {
      conn = this.base.useDb(dbName, { useCache: true });
      for (const [name, schema] of this.tenantModels) {
        if (!conn.models[name]) conn.model(name, schema);
      }
      this.tenantConns.set(dbName, conn);
    }
    return conn;
  }

  /** Feature modules call this at startup to register their tenant-scoped schemas. */
  registerTenantModel(name: string, schema: Schema): void {
    this.tenantModels.push([name, schema]);
  }
}
