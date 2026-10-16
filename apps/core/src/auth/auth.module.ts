import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { JWT_VERIFIER, JwtAuthGuard } from './jwt-auth.guard';
import { JwtVerifier, erzeugeJwksKeyResolver } from './jwt.service';
import { RolesGuard } from './roles.guard';

/**
 * Authentifizierung und Rollenprüfung (T-004), global erzwungen.
 * Reihenfolge der globalen Guards: erst JWT (setzt Principal), dann Rollen.
 */
@Global()
@Module({
  providers: [
    {
      provide: JWT_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const issuer = config.get('OIDC_ISSUER_URL', { infer: true });
        return new JwtVerifier({ issuer, getKey: erzeugeJwksKeyResolver(issuer) });
      },
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JWT_VERIFIER],
})
export class AuthModule {}
