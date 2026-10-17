/**
 * Datensichtbarkeit (F-41): Wer darf welchen Datensatz sehen?
 *
 * - Interne Rollen (admin, ops, qa_approver, dpo): alles im eigenen Mandanten.
 * - Kundenrollen (kunde_dispo, kunde_qa): nur Daten des eigenen Kunden. Welcher
 *   Login zu welchem Kunden gehört, steht im Kern (`kunde_konto`, D-001: Rechte
 *   im Kern) – Keycloak meldet nur an. Ohne Zuordnung: abgelehnt, nie „alles“.
 *
 * Fremde Datensätze sind „nicht gefunden“ (nicht „verboten“) – so verrät der
 * Kern nicht, dass es sie gibt. Jeder Controller, den Kundenrollen erreichen,
 * prüft hier, bevor er Daten liefert.
 */
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { hatRolle, type Principal } from '@rent2cool/shared';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import {
  abweichung,
  alarm,
  fahrer,
  fahrzeug,
  kunde,
  kundeKonto,
  miete,
  rechnung,
  schluessel,
  temperaturnachweisArchiv,
} from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';

export interface Sicht {
  mandantId: string;
  /** Gesetzt = Kundensicht: nur Daten dieses Kunden. `null` = interne Sicht. */
  kundeId: string | null;
}

const INTERN = ['admin', 'ops', 'qa_approver', 'dpo'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ungültige ID = nicht gefunden (statt eines Datenbankfehlers). */
function gueltig(wert: string, meldung: string): string {
  if (!UUID.test(wert)) throw new NotFoundException(meldung);
  return wert;
}

@Injectable()
export class Zugriff {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Sicht des Akteurs; Kundenrolle ohne zugeordneten Kunden → abgelehnt. */
  async sicht(p: Principal): Promise<Sicht> {
    const mandantId = p.mandantId ?? PLACEHOLDER_MANDANT_ID;
    if (hatRolle(p, ...INTERN)) return { mandantId, kundeId: null };
    const [k] = await this.db
      .select({ kundeId: kundeKonto.kundeId, mandantId: kundeKonto.mandantId })
      .from(kundeKonto)
      .where(eq(kundeKonto.kontoId, p.akteurId));
    if (!k || k.mandantId !== mandantId) {
      throw new ForbiddenException('Ihr Zugang ist keinem Kunden zugeordnet');
    }
    return { mandantId, kundeId: k.kundeId };
  }

  async miete(p: Principal, id: string): Promise<Sicht> {
    const s = await this.sicht(p);
    const [m] = await this.db
      .select({ mandantId: miete.mandantId, kundeId: miete.kundeId })
      .from(miete)
      .where(eq(miete.id, gueltig(id, 'Miete nicht gefunden')));
    return this.passt(s, m, 'Miete nicht gefunden');
  }

  async kunde(p: Principal, id: string): Promise<Sicht> {
    const s = await this.sicht(p);
    const [k] = await this.db
      .select({ mandantId: kunde.mandantId, kundeId: kunde.id })
      .from(kunde)
      .where(eq(kunde.id, gueltig(id, 'Kunde nicht gefunden')));
    return this.passt(s, k, 'Kunde nicht gefunden');
  }

  async fahrer(p: Principal, id: string): Promise<Sicht> {
    const s = await this.sicht(p);
    const [f] = await this.db
      .select({ mandantId: kunde.mandantId, kundeId: fahrer.kundeId })
      .from(fahrer)
      .innerJoin(kunde, eq(fahrer.kundeId, kunde.id))
      .where(eq(fahrer.id, gueltig(id, 'Fahrer nicht gefunden')));
    return this.passt(s, f, 'Fahrer nicht gefunden');
  }

  async rechnung(p: Principal, id: string): Promise<Sicht> {
    const s = await this.sicht(p);
    const [r] = await this.db
      .select({ mandantId: rechnung.mandantId, kundeId: rechnung.kundeId })
      .from(rechnung)
      .where(eq(rechnung.id, gueltig(id, 'Rechnung nicht gefunden')));
    return this.passt(s, r, 'Rechnung nicht gefunden');
  }

  /** Alarm: Kunden sehen nur Alarme ihrer Mieten. */
  async alarm(p: Principal, id: string): Promise<Sicht> {
    const s = await this.sicht(p);
    const [a] = await this.db
      .select({ mandantId: alarm.mandantId, kundeId: miete.kundeId })
      .from(alarm)
      .leftJoin(miete, eq(alarm.mieteId, miete.id))
      .where(eq(alarm.id, gueltig(id, 'Alarm nicht gefunden')));
    return this.passt(s, a, 'Alarm nicht gefunden');
  }

  /** Abweichung: Kunden sehen nur Abweichungen zu ihren Mieten. */
  async abweichung(p: Principal, id: string): Promise<Sicht> {
    const s = await this.sicht(p);
    const [a] = await this.db
      .select({ mandantId: abweichung.mandantId, kundeId: miete.kundeId })
      .from(abweichung)
      .leftJoin(miete, and(eq(abweichung.bezugTyp, 'miete'), eq(abweichung.bezugId, miete.id)))
      .where(eq(abweichung.id, gueltig(id, 'Abweichung nicht gefunden')));
    return this.passt(s, a, 'Abweichung nicht gefunden');
  }

  async nachweis(p: Principal, id: string): Promise<Sicht> {
    const s = await this.sicht(p);
    const [a] = await this.db
      .select({ mandantId: temperaturnachweisArchiv.mandantId, kundeId: miete.kundeId })
      .from(temperaturnachweisArchiv)
      .innerJoin(miete, eq(temperaturnachweisArchiv.mieteId, miete.id))
      .where(eq(temperaturnachweisArchiv.id, gueltig(id, 'Nachweis nicht gefunden')));
    return this.passt(s, a, 'Nachweis nicht gefunden');
  }

  async schluessel(p: Principal, id: string): Promise<Sicht> {
    const s = await this.sicht(p);
    const [k] = await this.db
      .select({ mandantId: schluessel.mandantId, kundeId: miete.kundeId })
      .from(schluessel)
      .innerJoin(miete, eq(schluessel.mieteId, miete.id))
      .where(eq(schluessel.id, gueltig(id, 'Schlüssel nicht gefunden')));
    return this.passt(s, k, 'Schlüssel nicht gefunden');
  }

  /**
   * Fahrzeug: intern im Mandanten. Kunden nur Fahrzeuge ihrer Mieten – mit
   * `nurLaufend` (z. B. Position) nur während einer laufenden Miete;
   * `nurMandant` (z. B. Buchbarkeit bei der Buchung) ohne Mietbezug.
   */
  async fahrzeug(
    p: Principal,
    id: string,
    o: { nurLaufend?: boolean; nurMandant?: boolean } = {},
  ): Promise<Sicht> {
    const s = await this.sicht(p);
    const [f] = await this.db
      .select({ mandantId: fahrzeug.mandantId })
      .from(fahrzeug)
      .where(eq(fahrzeug.id, gueltig(id, 'Fahrzeug nicht gefunden')));
    if (!f || f.mandantId !== s.mandantId) throw new NotFoundException('Fahrzeug nicht gefunden');
    if (s.kundeId === null || o.nurMandant) return s;
    const [eigene] = await this.db
      .select({ id: miete.id })
      .from(miete)
      .where(
        and(
          eq(miete.fahrzeugId, id),
          eq(miete.kundeId, s.kundeId),
          o.nurLaufend
            ? eq(miete.status, 'aktiv')
            : inArray(miete.status, ['bestaetigt', 'aktiv', 'beendet', 'abgerechnet']),
        ),
      )
      .limit(1);
    if (!eigene) throw new NotFoundException('Fahrzeug nicht gefunden');
    return s;
  }

  private passt(
    s: Sicht,
    d: { mandantId: string; kundeId: string | null } | undefined,
    meldung: string,
  ): Sicht {
    if (!d || d.mandantId !== s.mandantId) throw new NotFoundException(meldung);
    if (s.kundeId !== null && d.kundeId !== s.kundeId) throw new NotFoundException(meldung);
    return s;
  }
}
