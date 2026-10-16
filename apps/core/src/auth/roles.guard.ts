import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hatRolle, type Rolle } from '@rent2cool/shared';
import { type AuthRequest, ROLES_KEY } from './decorators';

/**
 * Prüft die mit `@Roles(...)` geforderten Rollen gegen den Principal. Routen
 * ohne `@Roles` sind nach bestandener Authentifizierung erlaubt.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const erforderlich = this.reflector.getAllAndOverride<Rolle[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!erforderlich || erforderlich.length === 0) {
      return true;
    }
    const principal = context.switchToHttp().getRequest<AuthRequest>().principal;
    if (!principal || !hatRolle(principal, ...erforderlich)) {
      throw new ForbiddenException('Fehlende Rolle');
    }
    return true;
  }
}
