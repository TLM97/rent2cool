import { SetMetadata } from '@nestjs/common';

/**
 * Markiert eine schreibende Route als auditpflichtig. Der AuditInterceptor
 * protokolliert dann jede erfolgreiche Ausführung automatisch (Backstop).
 */
export const AUDITED_KEY = 'audit:entitaet';
export const Audited = (entitaetTyp: string): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDITED_KEY, entitaetTyp);
