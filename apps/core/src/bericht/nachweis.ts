/**
 * Reine Berechnung des Temperaturnachweises (T-„Temperaturbericht v1").
 * Keine DB, kein Netz – damit gut testbar. Die Datenbeschaffung liegt im
 * BerichtService, das Rendern/Speichern in eigenen Modulen.
 */
import { createHash } from 'node:crypto';
import {
  nowUtcIso,
  type Grenzverletzung,
  type Luecke,
  type TemperaturNachweis,
  type Temperaturprofil,
} from '@rent2cool/shared';
import type { Signierer } from './signierer';

export interface Messpunkt {
  /** ISO-8601 UTC. */
  readonly zeit: string;
  readonly wert: number;
}

export interface NachweisParams {
  readonly fahrzeugId: string;
  readonly messgroesse: string;
  readonly von: string;
  readonly bis: string;
  readonly profil: Temperaturprofil;
  /** Lücke = Abstand zweier Messungen größer als diese Schwelle (Minuten). */
  readonly lueckeSchwelleMin: number;
}

export function berechneNachweis(
  punkte: Messpunkt[],
  params: NachweisParams,
  signierer: Signierer,
): TemperaturNachweis {
  const sortiert = [...punkte].sort((a, b) => a.zeit.localeCompare(b.zeit));
  const werte = sortiert.map((p) => p.wert);
  const anzahl = werte.length;

  const grenzverletzungen: Grenzverletzung[] = [];
  for (const p of sortiert) {
    if (p.wert < params.profil.minC) {
      grenzverletzungen.push({ zeit: p.zeit, wert: p.wert, art: 'unter' });
    } else if (p.wert > params.profil.maxC) {
      grenzverletzungen.push({ zeit: p.zeit, wert: p.wert, art: 'ueber' });
    }
  }

  const luecken: Luecke[] = [];
  for (let i = 1; i < sortiert.length; i++) {
    const t0 = new Date(sortiert[i - 1].zeit).getTime();
    const t1 = new Date(sortiert[i].zeit).getTime();
    const dauerMin = (t1 - t0) / 60_000;
    if (dauerMin > params.lueckeSchwelleMin) {
      luecken.push({
        von: sortiert[i - 1].zeit,
        bis: sortiert[i].zeit,
        dauerMin: Math.round(dauerMin),
      });
    }
  }

  const bewertung =
    anzahl === 0
      ? 'unvollstaendig'
      : grenzverletzungen.length > 0
        ? 'verletzt'
        : luecken.length > 0
          ? 'unvollstaendig'
          : 'eingehalten';

  // Hash über die kanonische Datenbasis -> Signatur (fälschungssicher).
  const datenHash = createHash('sha256').update(JSON.stringify(sortiert), 'utf8').digest('hex');

  return {
    schemaVersion: 1,
    fahrzeugId: params.fahrzeugId,
    messgroesse: params.messgroesse,
    von: params.von,
    bis: params.bis,
    erzeugtAm: nowUtcIso(),
    profil: params.profil,
    kennzahlen: {
      anzahl,
      minC: anzahl ? Math.min(...werte) : null,
      maxC: anzahl ? Math.max(...werte) : null,
      mittelC: anzahl ? Number((werte.reduce((a, b) => a + b, 0) / anzahl).toFixed(3)) : null,
      ersteMessung: sortiert[0]?.zeit ?? null,
      letzteMessung: sortiert.at(-1)?.zeit ?? null,
    },
    grenzverletzungen,
    luecken,
    bewertung,
    integritaet: {
      algorithmus: signierer.algorithmus,
      datenHash,
      signatur: signierer.signiere(datenHash),
    },
  };
}
