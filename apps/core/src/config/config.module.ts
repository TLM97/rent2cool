import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from './env';

/** Typsicherer ConfigService für den Rest der App. */
export type AppConfigService = ConfigService<Env, true>;

/**
 * Globale Konfiguration. `validate` lässt den Dienst nur mit gültiger
 * Umgebung starten (siehe env.ts). `.env` wird lokal geladen; in der Cloud
 * kommen die Werte aus echten Umgebungsvariablen (D-005).
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}

export { ConfigService };
