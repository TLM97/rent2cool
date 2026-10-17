/**
 * Gemeinsamer Ablauf aller Statuswechsel (Statusmodelle in @rent2cool/shared):
 * Datensatz mit Zeilensperre laden → Übergang prüfen → speichern → Audit mit
 * altem und neuem Wert – alles in einer Transaktion. Die Sperre verhindert,
 * dass zwei gleichzeitige Wechsel vom selben Stand beide gelingen (z. B. eine
 * Miete gleichzeitig „aktiv“ und „storniert“).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Principal } from '@rent2cool/shared';
import type { Database, Transaktion } from '../db/client';
import { ermittleAenderungen } from './aenderung';
import { schreibeAudit } from './audit.service';

type Datensatz = { status: string } & Record<string, unknown>;

export interface StatusWechsel<S extends string, D extends Datensatz> {
  /** Audit-Typ, z. B. `kunde_status`. */
  entitaetTyp: string;
  id: string;
  nach: S;
  nichtGefunden: string;
  /** Datensatz laden – mit `FOR UPDATE` und Mandantenprüfung; `undefined` = nicht gefunden. */
  lade: (tx: Transaktion) => Promise<D | undefined>;
  istStatus: (s: string) => s is S;
  erlaubt: (von: S, nach: S) => boolean;
  /** Weitere Felder dieses Wechsels (z. B. `startIst`), berechnet aus dem alten Stand. */
  zusatz?: (vorher: D) => Record<string, unknown>;
  /** Das UPDATE (setzt ggf. `aktualisiertAm` selbst). */
  speichere: (tx: Transaktion, werte: Record<string, unknown>) => Promise<void>;
  /** Folgeschritt in derselben Transaktion, nur wenn sich der Status geändert hat. */
  danach?: (tx: Transaktion, von: S) => Promise<void>;
}

export interface StatusErgebnis<S extends string> {
  id: string;
  status: S;
  /** Status vor dem Aufruf. */
  von: S;
  /** false: nichts zu tun (gleicher Status, keine Feldänderung) – kein Audit-Eintrag. */
  geaendert: boolean;
}

export function wechsleStatus<S extends string, D extends Datensatz>(
  ausfuehrer: Database | Transaktion,
  principal: Principal,
  o: StatusWechsel<S, D>,
): Promise<StatusErgebnis<S>> {
  // In einer laufenden Transaktion wird daraus ein Savepoint.
  return ausfuehrer.transaction(async (tx) => {
    const vorher = await o.lade(tx);
    if (!vorher) {
      throw new NotFoundException(o.nichtGefunden);
    }
    const von = vorher.status;
    if (!o.istStatus(von)) {
      throw new BadRequestException(`Unbekannter aktueller Status: ${von}`);
    }
    if (von !== o.nach && !o.erlaubt(von, o.nach)) {
      throw new BadRequestException(`Statusübergang "${von}" -> "${o.nach}" ist nicht erlaubt`);
    }
    const werte = { status: o.nach, ...(o.zusatz?.(vorher) ?? {}) };
    const a = ermittleAenderungen(vorher, werte);
    if (a.felder.length === 0) {
      return { id: o.id, status: o.nach, von, geaendert: false };
    }
    await o.speichere(tx, Object.fromEntries(a.felder.map((f) => [f, werte[f as keyof typeof werte]])));
    await schreibeAudit(tx, principal, {
      aktion: 'POST',
      entitaetTyp: o.entitaetTyp,
      entitaetId: o.id,
      // Status immer mitprotokollieren, auch wenn nur Felder geändert wurden.
      altWert: { status: von, ...a.alt },
      neuWert: { status: o.nach, ...a.neu },
    });
    if (von !== o.nach) {
      await o.danach?.(tx, von);
    }
    return { id: o.id, status: o.nach, von, geaendert: true };
  });
}
