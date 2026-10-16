/**
 * Schreibt Audit-Einträge (T-004). Bevorzugter, präziser Weg: Das Service-/
 * Modul-Layer kennt alten und neuen Wert und ruft `protokolliere` direkt auf.
 * Für Routen, die das (noch) nicht tun, greift zusätzlich der AuditInterceptor.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '@rent2cool/shared';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { auditEvent } from '../db/schema/audit';

export interface AuditEingabe {
  aktion: string;
  entitaetTyp: string;
  entitaetId?: string;
  altWert?: unknown;
  neuWert?: unknown;
  quelle?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async protokolliere(principal: Principal, e: AuditEingabe): Promise<void> {
    await this.db.insert(auditEvent).values({
      akteurId: principal.akteurId,
      akteurRolle: principal.rollen[0] ?? null,
      aktion: e.aktion,
      entitaetTyp: e.entitaetTyp,
      entitaetId: e.entitaetId ?? null,
      altWert: e.altWert ?? null,
      neuWert: e.neuWert ?? null,
      mandantId: principal.mandantId ?? null,
      quelle: e.quelle ?? 'core',
    });
  }
}
