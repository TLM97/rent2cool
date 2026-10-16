import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Principal, Rolle } from '@rent2cool/shared';

/** Markiert eine Route als öffentlich (kein Token nötig), z. B. Health. */
export const PUBLIC_KEY = 'auth:public';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);

/** Fordert mindestens eine der angegebenen Rollen. */
export const ROLES_KEY = 'auth:roles';
export const Roles = (...rollen: Rolle[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, rollen);

/** Request mit angehängtem Principal (nach erfolgreicher Authentifizierung). */
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  principal?: Principal;
}

/** Injiziert den aktuellen Principal in einen Controller-Parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined =>
    ctx.switchToHttp().getRequest<AuthRequest>().principal,
);
