/**
 * Öffnungszeiten im Formular: je Wochentag bis zu zwei Zeitfenster
 * (`oz_mo_von1`, `oz_mo_bis1`, `oz_mo_von2`, …) oder „rund um die Uhr“
 * (`oz_rund`). Ende „00:00“ bedeutet Mitternacht (24:00), weil
 * Uhrzeit-Felder 24:00 nicht kennen.
 */
import {
  oeffnungsregelnSchema,
  WOCHENTAGE,
  type Oeffnungsregeln,
  type Wochentag,
} from '@rent2cool/shared';

export const FENSTER_JE_TAG = 2;

export function feldName(tag: Wochentag, teil: 'von' | 'bis', nr: number): string {
  return `oz_${tag}_${teil}${nr}`;
}

/** Formularwerte (Vorbelegung) aus gespeicherten Regeln. */
export function formularWerte(regeln: Oeffnungsregeln | null | undefined): Record<string, string> {
  const werte: Record<string, string> = {};
  if (!regeln) {
    werte.oz_rund = 'on';
    return werte;
  }
  for (const tag of WOCHENTAGE) {
    (regeln.woche[tag] ?? []).slice(0, FENSTER_JE_TAG).forEach((f, i) => {
      werte[feldName(tag, 'von', i + 1)] = f.von;
      werte[feldName(tag, 'bis', i + 1)] = f.bis === '24:00' ? '00:00' : f.bis;
    });
  }
  return werte;
}

/** Mehr Fenster gespeichert, als das Formular zeigt? Dann nicht über das Formular ändern. */
export function hatMehrFenster(regeln: Oeffnungsregeln | null | undefined): boolean {
  return Boolean(regeln && WOCHENTAGE.some((t) => (regeln.woche[t]?.length ?? 0) > FENSTER_JE_TAG));
}

export type RegelnErgebnis =
  { ok: true; regeln: Oeffnungsregeln | null } | { ok: false; feldFehler: Record<string, string> };

/** Regeln aus Formularwerten bauen und mit dem geteilten Schema prüfen. */
export function regelnAusFormular(werte: Record<string, string | undefined>): RegelnErgebnis {
  if (werte.oz_rund === 'on') return { ok: true, regeln: null };
  const feldFehler: Record<string, string> = {};
  const woche: Partial<Record<Wochentag, { von: string; bis: string }[]>> = {};
  for (const tag of WOCHENTAGE) {
    for (let nr = 1; nr <= FENSTER_JE_TAG; nr++) {
      const von = werte[feldName(tag, 'von', nr)]?.trim() ?? '';
      const bisRoh = werte[feldName(tag, 'bis', nr)]?.trim() ?? '';
      if (!von && !bisRoh) continue;
      if (!von || !bisRoh) {
        feldFehler[feldName(tag, von ? 'bis' : 'von', nr)] = 'Beginn und Ende angeben';
        continue;
      }
      const bis = bisRoh === '00:00' ? '24:00' : bisRoh;
      (woche[tag] ??= []).push({ von, bis });
    }
  }
  if (Object.keys(feldFehler).length > 0) return { ok: false, feldFehler };
  const r = oeffnungsregelnSchema.safeParse({ zeitzone: 'Europe/Berlin', woche });
  if (r.success) return { ok: true, regeln: r.data };
  for (const i of r.error.issues) {
    // Pfad z. B. ["woche","mo",0,"bis"] → oz_mo_bis1
    const [, tag, index, teil] = i.path;
    if (
      typeof tag === 'string' &&
      typeof index === 'number' &&
      (teil === 'von' || teil === 'bis')
    ) {
      feldFehler[feldName(tag as Wochentag, teil, index + 1)] ??= i.message;
    }
  }
  return { ok: false, feldFehler };
}
