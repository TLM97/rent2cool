/**
 * Schreibt Audit-Einträge (T-004). Bevorzugter, präziser Weg: Das Service-/
 * Modul-Layer kennt alten und neuen Wert und ruft `protokolliere` direkt auf.
 * Für Routen, die das (noch) nicht tun, greift zusätzlich der AuditInterceptor.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, inArray, sql } from 'drizzle-orm';
import type { Principal } from '@rent2cool/shared';
import type { Database, Transaktion } from '../db/client';
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

/**
 * Audit-Eintrag schreiben – auch innerhalb einer laufenden Transaktion, damit
 * Änderung und Protokoll gemeinsam gelingen oder gemeinsam scheitern.
 */
export async function schreibeAudit(
  ausfuehrer: Database | Transaktion,
  principal: Principal,
  e: AuditEingabe,
): Promise<void> {
  await ausfuehrer.insert(auditEvent).values({
    akteurId: principal.akteurId,
    akteurName: principal.name ?? null,
    akteurRolle: principal.rollen.length > 0 ? principal.rollen.join(',') : null,
    aktion: e.aktion,
    entitaetTyp: e.entitaetTyp,
    entitaetId: e.entitaetId ?? null,
    altWert: e.altWert ?? null,
    neuWert: e.neuWert ?? null,
    mandantId: principal.mandantId ?? null,
    quelle: e.quelle ?? 'core',
  });
}

/**
 * Anlegen protokollieren: der vollständige neue Datensatz als neuer Wert
 * (alter Wert leer), in der Transaktion des Anlegens.
 */
export function protokolliereAnlage(
  tx: Database | Transaktion,
  principal: Principal,
  entitaetTyp: string,
  entitaetId: string,
  datensatz: unknown,
): Promise<void> {
  return schreibeAudit(tx, principal, {
    aktion: 'POST',
    entitaetTyp,
    entitaetId,
    altWert: null,
    neuWert: datensatz,
  });
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async protokolliere(principal: Principal, e: AuditEingabe): Promise<void> {
    await schreibeAudit(this.db, principal, e);
  }

  /**
   * Verlauf eines oder mehrerer zusammengehöriger Datensätze (z. B. Fahrzeug
   * und Sensoren), neueste zuerst. `typen` begrenzt auf die
   * Audit-Typen der Entität (z. B. `miete`, `miete_status`) und nutzt so den
   * Index (entitaet_typ, entitaet_id, zeit).
   */
  async verlauf(opts: {
    entitaetIds: string[];
    typen: string[];
    limit: number;
    offset: number;
  }): Promise<{ eintraege: (typeof auditEvent.$inferSelect)[]; gesamt: number }> {
    const filter = and(
      inArray(auditEvent.entitaetId, opts.entitaetIds),
      inArray(auditEvent.entitaetTyp, opts.typen),
    );
    const [eintraege, [zaehler]] = await Promise.all([
      this.db
        .select()
        .from(auditEvent)
        .where(filter)
        .orderBy(desc(auditEvent.zeit))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(auditEvent)
        .where(filter),
    ]);
    return { eintraege, gesamt: zaehler?.n ?? 0 };
  }
}
