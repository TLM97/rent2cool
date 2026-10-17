/**
 * Standorte (D-011): Übergabe und Rückgabe am Firmenstandort. Standorte sind
 * Datensätze mit Adresse, Geofence und Öffnungsregeln – im Code steht kein Ort.
 *
 * Öffnungsregeln: Wochenplan in der Ortszeit des Standorts. Fehlt ein Tag, ist
 * an dem Tag geschlossen; fehlen die Regeln ganz (`null`), ist der Standort
 * rund um die Uhr nutzbar (kontaktlose Übergabe, D-014).
 */
import { z } from 'zod';

export const WOCHENTAGE = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'] as const;
export type Wochentag = (typeof WOCHENTAGE)[number];

export const WOCHENTAG_NAME: Record<Wochentag, string> = {
  mo: 'Montag',
  di: 'Dienstag',
  mi: 'Mittwoch',
  do: 'Donnerstag',
  fr: 'Freitag',
  sa: 'Samstag',
  so: 'Sonntag',
};

const uhrzeit = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Uhrzeit als HH:MM');

export const zeitfensterSchema = z
  .object({ von: uhrzeit, bis: uhrzeit })
  .refine((f) => f.bis > f.von, { message: 'Ende muss nach dem Beginn liegen', path: ['bis'] });
export type Zeitfenster = z.infer<typeof zeitfensterSchema>;

export const oeffnungsregelnSchema = z.object({
  zeitzone: z.literal('Europe/Berlin').default('Europe/Berlin'),
  woche: z.object(
    Object.fromEntries(
      WOCHENTAGE.map((t) => [t, z.array(zeitfensterSchema).max(4).optional()]),
    ) as Record<Wochentag, z.ZodOptional<z.ZodArray<typeof zeitfensterSchema>>>,
  ),
});
export type Oeffnungsregeln = z.infer<typeof oeffnungsregelnSchema>;

const TAG_VON_INTL: Record<string, Wochentag> = {
  Mon: 'mo',
  Tue: 'di',
  Wed: 'mi',
  Thu: 'do',
  Fri: 'fr',
  Sat: 'sa',
  Sun: 'so',
};

/** Wochentag und Uhrzeit (HH:MM) eines Zeitpunkts in der Zeitzone (Sommer-/Winterzeit). */
export function ortszeit(zeitpunkt: Date, zeitzone: string): { tag: Wochentag; uhrzeit: string } {
  const teile = new Intl.DateTimeFormat('en-US', {
    timeZone: zeitzone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(zeitpunkt);
  const wert = (typ: string) => teile.find((t) => t.type === typ)?.value ?? '';
  return { tag: TAG_VON_INTL[wert('weekday')]!, uhrzeit: `${wert('hour')}:${wert('minute')}` };
}

/** Ist der Standort zum Zeitpunkt geöffnet? Ohne Regeln: immer. Fenster [von, bis). */
export function istGeoeffnet(regeln: Oeffnungsregeln | null | undefined, zeitpunkt: Date): boolean {
  if (!regeln) return true;
  const { tag, uhrzeit: jetzt } = ortszeit(zeitpunkt, regeln.zeitzone);
  return (regeln.woche[tag] ?? []).some((f) => jetzt >= f.von && jetzt < f.bis);
}

/** Lesbare Öffnungszeiten je Tag, z. B. „Montag: 06:00–22:00“. */
export function oeffnungszeitenText(regeln: Oeffnungsregeln | null | undefined): string[] {
  if (!regeln) return ['rund um die Uhr'];
  return WOCHENTAGE.map((t) => {
    const fenster = regeln.woche[t] ?? [];
    return `${WOCHENTAG_NAME[t]}: ${fenster.length === 0 ? 'geschlossen' : fenster.map((f) => `${f.von}–${f.bis}`).join(', ')}`;
  });
}

// --- Eingaben ---
const pflicht = (meldung: string) => z.string().trim().min(1, meldung);
const leerbar = () => z.string().trim().nullable().optional();

const geofenceFelder = {
  geofenceLat: z.coerce
    .number({ invalid_type_error: 'Zahl erwartet' })
    .min(-90)
    .max(90)
    .nullable()
    .optional(),
  geofenceLng: z.coerce
    .number({ invalid_type_error: 'Zahl erwartet' })
    .min(-180)
    .max(180)
    .nullable()
    .optional(),
  geofenceRadiusM: z.coerce
    .number({ invalid_type_error: 'Zahl erwartet' })
    .int('Ganze Zahl erwartet')
    .min(10, 'Mindestens 10 m')
    .max(10_000, 'Höchstens 10 km')
    .nullable()
    .optional(),
};

/** Geofence vollständig oder gar nicht. */
function geofenceVollstaendig(s: {
  geofenceLat?: number | null;
  geofenceLng?: number | null;
  geofenceRadiusM?: number | null;
}) {
  const gesetzt = [s.geofenceLat, s.geofenceLng, s.geofenceRadiusM].filter(
    (w) => w !== null && w !== undefined,
  );
  return gesetzt.length === 0 || gesetzt.length === 3;
}
const GEOFENCE_MELDUNG = {
  message: 'Geofence: Breite, Länge und Radius zusammen angeben',
  path: ['geofenceRadiusM'],
};

export const standortErstellenSchema = z
  .object({
    name: pflicht('Name fehlt'),
    strasse: leerbar(),
    plz: leerbar(),
    ort: leerbar(),
    land: z.string().trim().min(2).max(2).default('DE'),
    region: leerbar(),
    ...geofenceFelder,
    oeffnungsregeln: oeffnungsregelnSchema.nullable().optional(),
  })
  .refine(geofenceVollstaendig, GEOFENCE_MELDUNG);
export type StandortErstellen = z.infer<typeof standortErstellenSchema>;

export const standortAendernSchema = z
  .object({
    version: z
      .string()
      .datetime({ offset: true, message: 'Version fehlt – bitte Seite neu laden' }),
    name: pflicht('Name fehlt').optional(),
    strasse: leerbar(),
    plz: leerbar(),
    ort: leerbar(),
    land: z.string().trim().min(2).max(2).optional(),
    region: leerbar(),
    ...geofenceFelder,
    oeffnungsregeln: oeffnungsregelnSchema.nullable().optional(),
    /** Deaktivieren nur ohne zugeordnete Fahrzeuge und künftige Mieten. */
    aktiv: z.boolean().optional(),
  })
  .refine(geofenceVollstaendig, GEOFENCE_MELDUNG);
export type StandortAendern = z.infer<typeof standortAendernSchema>;
