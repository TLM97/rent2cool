import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { type AuthRequest, PUBLIC_KEY } from './decorators';
import { JwtVerifier } from './jwt.service';
import { mitKundenkonto } from './konto';

export const JWT_VERIFIER = Symbol('JWT_VERIFIER');

/**
 * Erzwingt ein gültiges Keycloak-Token auf allen Routen außer den mit
 * `@Public()` markierten. Hängt den geprüften Principal an den Request –
 * für Kundenlogins ergänzt um Kunde und Organisationsrollen (F-51).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const oeffentlich = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (oeffentlich) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const auth = req.headers['authorization'];
    const header = Array.isArray(auth) ? auth[0] : auth;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Kein Bearer-Token');
    }
    let principal;
    try {
      principal = await this.verifier.verify(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('Token ungültig');
    }
    // Kundenlogins: Kunde und Organisationsrollen aus dem Kern (F-51).
    req.principal = await mitKundenkonto(this.db, principal);
    return true;
  }
}
