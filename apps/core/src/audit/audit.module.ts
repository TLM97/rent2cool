import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

/**
 * Audit Trail (T-004). Stellt den AuditService bereit und bindet den
 * AuditInterceptor global ein (wirkt nur auf `@Audited(...)`-Routen).
 */
@Global()
@Module({
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
