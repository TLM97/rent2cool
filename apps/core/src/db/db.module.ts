import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDbClient } from './client';
import type { Env } from '../config/env';

/** Injektions-Token für die Drizzle-Datenbank und den rohen SQL-Client. */
export const DB = Symbol('DB');
export const SQL = Symbol('SQL');

const DB_CLIENT = Symbol('DB_CLIENT');

type DbClient = ReturnType<typeof createDbClient>;

/**
 * Globale Datenbank-Anbindung (D-001). Verbindung aus der Env; ein Pool je
 * zustandsloser Instanz. Schließt sauber beim Herunterfahren.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createDbClient(config.get('DATABASE_URL', { infer: true })),
    },
    { provide: DB, inject: [DB_CLIENT], useFactory: (c: DbClient) => c.db },
    { provide: SQL, inject: [DB_CLIENT], useFactory: (c: DbClient) => c.sql },
  ],
  exports: [DB, SQL],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.sql.end({ timeout: 5 });
  }
}
