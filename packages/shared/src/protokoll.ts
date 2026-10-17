/**
 * Übergabe- und Rückgabeprotokoll mit Foto-Check (D-014, docs/datenmodell.md
 * §4.11). Der Fahrer dokumentiert in der App den Zustand des Fahrzeugs:
 * Pflichtfotos, Checkliste, Kilometerstand, Schäden. Abgeschlossene
 * Protokolle sind unveränderbar (GDP-Nachweis).
 *
 * Fotos liegen im Objektspeicher (D-003), nie in der Datenbank. Die App lädt
 * direkt dorthin hoch (signierter Link vom Kern); der Kern prüft danach Größe,
 * Typ und SHA-256-Prüfsumme.
 *
 * Pflichtfotos und Checkliste sind hier als Konfiguration gebündelt – ändern
 * ohne Umbau an Kern, Oberfläche oder App.
 */
import { z } from 'zod';

export const PROTOKOLL_ARTEN = ['uebergabe', 'rueckgabe'] as const;
export type ProtokollArt = (typeof PROTOKOLL_ARTEN)[number];
export const PROTOKOLL_ART_NAME: Record<ProtokollArt, string> = {
  uebergabe: 'Übergabe',
  rueckgabe: 'Rückgabe',
};

export const PROTOKOLL_STATUS = ['offen', 'abgeschlossen'] as const;
export type ProtokollStatus = (typeof PROTOKOLL_STATUS)[number];

export const FOTO_PERSPEKTIVEN = [
  'vorne',
  'hinten',
  'links',
  'rechts',
  'laderaum',
  'tacho',
  'schaden',
] as const;
export type FotoPerspektive = (typeof FOTO_PERSPEKTIVEN)[number];
export const FOTO_PERSPEKTIVE_NAME: Record<FotoPerspektive, string> = {
  vorne: 'Front',
  hinten: 'Heck',
  links: 'Fahrerseite links',
  rechts: 'Beifahrerseite rechts',
  laderaum: 'Laderaum innen',
  tacho: 'Kilometerstand / Kühlanzeige',
  schaden: 'Schaden (Detail)',
};

/** Ohne diese Fotos lässt sich ein Protokoll nicht abschließen. */
export const PFLICHT_FOTOS: readonly FotoPerspektive[] = [
  'vorne',
  'hinten',
  'links',
  'rechts',
  'laderaum',
  'tacho',
];

export interface ChecklistenPunkt {
  id: string;
  text: string;
}

/** Checkliste je Protokollart (Konfiguration). „nein“ verlangt eine Bemerkung. */
export const CHECKLISTE: Record<ProtokollArt, readonly ChecklistenPunkt[]> = {
  uebergabe: [
    { id: 'laderaum_sauber', text: 'Laderaum sauber, trocken und geruchsfrei' },
    { id: 'kuehlung_laeuft', text: 'Kühlaggregat läuft, Anzeige im Sollbereich' },
    { id: 'tuerdichtungen_ok', text: 'Türdichtungen des Laderaums intakt' },
    { id: 'keine_neuen_schaeden', text: 'Keine Schäden außer den bekannten' },
    { id: 'papiere_an_bord', text: 'Fahrzeugpapiere und Warnweste an Bord' },
  ],
  rueckgabe: [
    { id: 'laderaum_leer', text: 'Laderaum leer und besenrein' },
    { id: 'kuehlung_laeuft', text: 'Kühlaggregat läuft, Anzeige im Sollbereich' },
    { id: 'tuerdichtungen_ok', text: 'Türdichtungen des Laderaums intakt' },
    { id: 'keine_neuen_schaeden', text: 'Keine neuen Schäden' },
    { id: 'papiere_an_bord', text: 'Fahrzeugpapiere und Warnweste an Bord' },
  ],
};

export const FOTO_TYPEN = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type FotoTyp = (typeof FOTO_TYPEN)[number];
export const FOTO_MAX_BYTES = 15 * 1024 * 1024;

export const FOTO_STATUS = ['angefordert', 'hochgeladen', 'verworfen'] as const;
export type FotoStatus = (typeof FOTO_STATUS)[number];

export interface ChecklistenAntwort {
  ok: boolean;
  bemerkung?: string | null;
}

export interface Schaden {
  beschreibung: string;
  /** Fotos dieses Schadens (Perspektive `schaden`). */
  fotoIds?: string[];
}

export interface ProtokollPruefdaten {
  art: ProtokollArt;
  kmStand: number | null;
  checkliste: Record<string, ChecklistenAntwort> | null;
  /** Perspektiven der hochgeladenen (geprüften) Fotos. */
  fotos: readonly FotoPerspektive[];
}

/** Was fehlt zum Abschluss? Leere Liste = abschließbar. */
export function fehltZumAbschluss(p: ProtokollPruefdaten): string[] {
  const fehlt: string[] = [];
  for (const perspektive of PFLICHT_FOTOS) {
    if (!p.fotos.includes(perspektive)) {
      fehlt.push(`Foto fehlt: ${FOTO_PERSPEKTIVE_NAME[perspektive]}`);
    }
  }
  for (const punkt of CHECKLISTE[p.art]) {
    const a = p.checkliste?.[punkt.id];
    if (!a) fehlt.push(`Checkliste offen: ${punkt.text}`);
    else if (!a.ok && !a.bemerkung?.trim()) fehlt.push(`Bemerkung fehlt: ${punkt.text}`);
  }
  if (p.kmStand === null) fehlt.push('Kilometerstand fehlt');
  return fehlt;
}

/** Objektschlüssel eines Fotos – ohne Personen- oder Kundendaten, nach Monat gegliedert. */
export function fotoObjektSchluessel(o: {
  mandantId: string;
  protokollId: string;
  fotoId: string;
  typ: FotoTyp;
  zeit: Date;
}): string {
  const endung = o.typ === 'image/jpeg' ? 'jpg' : o.typ === 'image/png' ? 'png' : 'webp';
  const monat = o.zeit.toISOString().slice(0, 7).replace('-', '/');
  return `protokolle/${o.mandantId}/${monat}/${o.protokollId}/${o.fotoId}.${endung}`;
}

// --- Eingaben ---
const checklistenAntwortSchema = z.object({
  ok: z.boolean(),
  bemerkung: z.string().trim().max(1000).nullable().optional(),
});

const schadenSchema = z.object({
  beschreibung: z.string().trim().min(1, 'Beschreibung fehlt').max(1000),
  fotoIds: z.array(z.string().uuid()).max(10).optional(),
});

export const protokollAnlegenSchema = z.object({
  art: z.enum(PROTOKOLL_ARTEN),
});

export const protokollAendernSchema = z.object({
  version: z.string().datetime({ offset: true, message: 'Version fehlt – bitte Seite neu laden' }),
  kmStand: z.coerce
    .number({ invalid_type_error: 'Zahl erwartet' })
    .int('Ganze Zahl erwartet')
    .min(0)
    .max(2_000_000)
    .nullable()
    .optional(),
  checkliste: z.record(checklistenAntwortSchema).optional(),
  schaeden: z.array(schadenSchema).max(50).optional(),
});
export type ProtokollAendern = z.infer<typeof protokollAendernSchema>;

/** SHA-256 als Hex (64 Zeichen) – die App berechnet sie vor dem Hochladen. */
const sha256Hex = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, 'SHA-256 als Hex erwartet')
  .transform((s) => s.toLowerCase());

export const fotoAnfordernSchema = z.object({
  perspektive: z.enum(FOTO_PERSPEKTIVEN),
  contentType: z.enum(FOTO_TYPEN),
  groesse: z
    .number()
    .int()
    .min(1)
    .max(FOTO_MAX_BYTES, `Höchstens ${FOTO_MAX_BYTES / 1024 / 1024} MB`),
  sha256: sha256Hex,
  /** Aufnahmezeitpunkt laut Gerät (UTC) – informativ, maßgeblich ist der Eingang. */
  aufgenommenAm: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
});
export type FotoAnfordern = z.infer<typeof fotoAnfordernSchema>;
