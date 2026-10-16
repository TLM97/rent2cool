/**
 * Backstop für den Audit Trail (T-004): protokolliert jede erfolgreiche
 * Ausführung einer mit `@Audited(...)` markierten Route automatisch. Der
 * Audit-Eintrag wird VOR der Antwort geschrieben (concatMap wartet darauf),
 * damit kein Eintrag verloren geht.
 */
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, concatMap } from 'rxjs';
import type { AuthRequest } from '../auth/decorators';
import { AUDITED_KEY } from './audited.decorator';
import { AuditService } from './audit.service';

function istObjekt(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const entitaetTyp = this.reflector.getAllAndOverride<string>(AUDITED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!entitaetTyp) {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<AuthRequest>();

    return next.handle().pipe(
      concatMap(async (body) => {
        if (req.principal) {
          const entitaetId =
            istObjekt(body) && typeof body.id === 'string' ? body.id : undefined;
          await this.audit.protokolliere(req.principal, {
            aktion: req.method,
            entitaetTyp,
            entitaetId,
            neuWert: body,
          });
        }
        return body;
      }),
    );
  }
}
