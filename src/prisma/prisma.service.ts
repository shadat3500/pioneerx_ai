import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL!;
    const isLocal = /localhost|127\.0\.0\.1/i.test(connectionString);

    // Do NOT parse with `new URL()` — it mangles passwords that contain @ / %.
    // Strip sslmode so Pool ssl option wins; keep rest of query string intact.
    const poolUrl = connectionString
      .replace(/([?&])sslmode=[^&]*/i, '$1')
      .replace(/[?&]$/, '')
      .replace(/\?&/, '?');

    const pool = new Pool({
      connectionString: poolUrl,
      // Supabase requires TLS; skip strict CA verify (common on Windows / proxies).
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });

    super({
      adapter: new PrismaPg(pool),
    });

    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
