import { applyDecorators, SetMetadata } from '@nestjs/common';

/**
 * Markiert eine schreibende Route als auditpflichtig. Der AuditInterceptor
 * protokolliert dann jede erfolgreiche Ausführung automatisch (Backstop).
 */
export const AUDITED_KEY = 'audit:entitaet';
export const Audited = (entitaetTyp: string): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDITED_KEY, entitaetTyp);

/**
 * Die Route schreibt ihren Audit-Eintrag selbst – mit altem und neuem Wert und
 * in derselben Transaktion wie die Änderung (bevorzugter Weg). Der Interceptor
 * protokolliert dann nicht noch einmal. Gilt weiterhin als auditierte Route.
 */
export const AUDIT_IM_SERVICE_KEY = 'audit:im-service';
export const AuditImService = (entitaetTyp: string): MethodDecorator =>
  applyDecorators(SetMetadata(AUDITED_KEY, entitaetTyp), SetMetadata(AUDIT_IM_SERVICE_KEY, true));
