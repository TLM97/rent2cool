/**
 * Eingabe-Schemas für alle schreibenden Aktionen (D-001: geteilte Validierung
 * statt doppelter Modelle). Der Kern validiert damit seine API, die
 * Oberflächen dieselben Regeln vor dem Absenden – beide melden dieselben
 * (deutschen) Fehlertexte.
 */
import { z } from 'zod';
import { ABWEICHUNG_STATUS } from './alarm';
import { FAHRZEUG_STATUS } from './fahrzeug';
import { FAHRER_STATUS, KUNDE_STATUS } from './kunde';
import { MIETE_STATUS } from './miete';
import { RECHNUNG_STATUS } from './rechnung';

const pflicht = (feld = 'Pflichtfeld') => z.string().trim().min(1, feld);
const auswahl = (meldung = 'Bitte auswählen') => z.string().uuid(meldung);
const zeitpunkt = (meldung = 'Ungültiges Datum') =>
  z.string().datetime({ offset: true, message: meldung });
/** Optionales Textfeld beim Ändern: fehlt = unverändert, `null` = leeren. */
const leerbar = () => z.string().trim().nullable().optional();
/**
 * Versionsstand beim Öffnen des Formulars (`aktualisiertAm` des Datensatzes).
 * Hat inzwischen jemand anderes gespeichert, lehnt der Kern ab (409) statt
 * dessen Änderung stillschweigend zu überschreiben.
 */
const VERSION_FEHLT = 'Version fehlt – bitte Seite neu laden';
const version = () =>
  z.string({ required_error: VERSION_FEHLT }).datetime({ offset: true, message: VERSION_FEHLT });

// --- Fahrzeugakte ---
export const sensorEingabeSchema = z.object({
  messgroesse: pflicht(),
  einheit: pflicht(),
  modell: z.string().optional(),
  seriennummer: z.string().optional(),
});

export const aggregatEingabeSchema = z.object({
  typ: z.string().optional(),
  hersteller: z.string().optional(),
  seriennummer: z.string().optional(),
  temperaturQuelle: z.string().optional(),
  sensoren: z.array(sensorEingabeSchema).default([]),
});

export const fahrzeugErstellenSchema = z.object({
  kennzeichen: pflicht('Kennzeichen fehlt'),
  vin: z.string().optional(),
  fahrzeugprofil: z.string().optional(),
  zulGesamtmasseKg: z.coerce
    .number({ invalid_type_error: 'Zahl erwartet' })
    .int('Ganze Zahl erwartet')
    .positive('Muss größer als 0 sein'),
  benoetigteFuehrerscheinklasse: z.string().default('B'),
  hatFahrtenschreiber: z.boolean().default(false),
  standardTemperaturprofil: z.string().optional(),
  standortId: z.string().uuid().optional(),
  region: z.string().optional(),
  aggregat: aggregatEingabeSchema.optional(),
});
export type FahrzeugErstellen = z.infer<typeof fahrzeugErstellenSchema>;

export const fahrzeugStatusSchema = z.object({ status: z.enum(FAHRZEUG_STATUS) });

/** Stammdaten ändern; Status, Standort und Kühlaufbau haben eigene Wege. */
export const fahrzeugAendernSchema = z.object({
  version: version(),
  kennzeichen: pflicht('Kennzeichen fehlt').optional(),
  vin: leerbar(),
  zulGesamtmasseKg: z.coerce
    .number({ invalid_type_error: 'Zahl erwartet' })
    .int('Ganze Zahl erwartet')
    .positive('Muss größer als 0 sein')
    .optional(),
  benoetigteFuehrerscheinklasse: pflicht('Klasse fehlt').optional(),
  hatFahrtenschreiber: z.boolean().optional(),
  standardTemperaturprofil: leerbar(),
  /** Heimatstandort (D-011); `null` = keiner. */
  standortId: z.string().uuid('Standort auswählen').nullable().optional(),
});
export type FahrzeugAendern = z.infer<typeof fahrzeugAendernSchema>;

export const kalibrierungSchema = z
  .object({
    durchgefuehrtAm: zeitpunkt(),
    gueltigBis: zeitpunkt(),
    pruefstelle: z.string().optional(),
    zertifikatRef: z.string().optional(),
    ergebnis: z.string().optional(),
  })
  .refine((k) => new Date(k.gueltigBis).getTime() > new Date(k.durchgefuehrtAm).getTime(), {
    message: 'Muss nach dem Prüfdatum liegen',
    path: ['gueltigBis'],
  });
export type KalibrierungEingabe = z.infer<typeof kalibrierungSchema>;

/**
 * Sensor tauschen: alter Sensor wird ausgebaut (bleibt mit Historie erhalten),
 * der neue übernimmt Messgröße und Einheit. Ohne Kalibrierung ist das Fahrzeug
 * danach nicht buchbar (R-08/R-09) – sie kann gleich mit erfasst werden.
 */
export const sensorTauschSchema = z.object({
  seriennummer: pflicht('Seriennummer des neuen Sensors fehlt'),
  modell: z.string().trim().optional(),
  grund: pflicht('Grund für den Tausch fehlt'),
  kalibrierung: kalibrierungSchema.optional(),
});
export type SensorTausch = z.infer<typeof sensorTauschSchema>;

// --- Kunde & Fahrer ---
export const kundeErstellenSchema = z.object({
  firmenname: pflicht('Firmenname fehlt'),
  handelsregisternummer: z.string().optional(),
  ustId: z.string().optional(),
  strasse: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  land: z.string().default('DE'),
});
export type KundeErstellen = z.infer<typeof kundeErstellenSchema>;

export const kundeStatusSchema = z.object({ status: z.enum(KUNDE_STATUS) });

export const kundeAendernSchema = z.object({
  version: version(),
  firmenname: pflicht('Firmenname fehlt').optional(),
  handelsregisternummer: leerbar(),
  ustId: leerbar(),
  strasse: leerbar(),
  plz: leerbar(),
  ort: leerbar(),
  land: pflicht('Land fehlt').optional(),
});
export type KundeAendern = z.infer<typeof kundeAendernSchema>;

export const fahrerErstellenSchema = z.object({
  name: pflicht('Name fehlt'),
  fuehrerscheinKlasse: pflicht('Klasse fehlt'),
  fuehrerscheinNummer: z.string().optional(),
  fuehrerscheinGueltigBis: zeitpunkt().optional(),
});
export type FahrerErstellen = z.infer<typeof fahrerErstellenSchema>;

export const fahrerStatusSchema = z.object({ status: z.enum(FAHRER_STATUS) });

export const fahrerAendernSchema = z.object({
  version: version(),
  name: pflicht('Name fehlt').optional(),
  fuehrerscheinKlasse: pflicht('Klasse fehlt').optional(),
  fuehrerscheinNummer: leerbar(),
  fuehrerscheinGueltigBis: zeitpunkt().nullable().optional(),
  /** Login-Konto des Fahrers (Benutzer-ID in Keycloak) – für den digitalen Schlüssel in der App. */
  kontoId: leerbar(),
});
export type FahrerAendern = z.infer<typeof fahrerAendernSchema>;

// --- Miete ---
export const mieteErstellenSchema = z
  .object({
    kundeId: auswahl('Kunde auswählen'),
    fahrzeugId: auswahl('Fahrzeug auswählen'),
    fahrerId: z.string().uuid().optional(),
    standortAbholId: z.string().uuid().optional(),
    standortRueckgabeId: z.string().uuid().optional(),
    region: z.string().optional(),
    startGeplant: zeitpunkt(),
    endeGeplant: zeitpunkt(),
    tarif: z.string().optional(),
    auslandsfahrtGeplant: z.boolean().default(false),
    temperaturprofil: z.string().optional(),
    idempotencyKey: z.string().min(1).optional(),
  })
  .refine((m) => new Date(m.endeGeplant).getTime() > new Date(m.startGeplant).getTime(), {
    message: 'Ende muss nach dem Start liegen',
    path: ['endeGeplant'],
  });
export type MieteErstellen = z.infer<typeof mieteErstellenSchema>;

export const mieteStatusSchema = z.object({ status: z.enum(MIETE_STATUS) });

// --- Rechnung ---
export const rechnungErstellenSchema = z.object({
  mieteId: auswahl('Miete fehlt'),
  /** Nettobetrag in Euro (wird in Cent umgerechnet). */
  netto: z.coerce
    .number({ invalid_type_error: 'Betrag erwartet' })
    .positive('Muss größer als 0 sein'),
  /** Optionaler Steuersatz in Prozent; sonst Standard aus der Konfiguration. */
  steuerSatz: z.coerce.number().int('Ganze Zahl erwartet').min(0).max(100).optional(),
});
export type RechnungErstellen = z.infer<typeof rechnungErstellenSchema>;

export const rechnungStatusSchema = z.object({ status: z.enum(RECHNUNG_STATUS) });

// --- Abweichung ---
export const ABWEICHUNG_BEZUG = ['alarm', 'miete', 'fahrzeug'] as const;

export const abweichungErstellenSchema = z.object({
  bezugTyp: z.enum(ABWEICHUNG_BEZUG),
  bezugId: auswahl('Bezug fehlt'),
  beschreibung: pflicht('Beschreibung fehlt'),
  schweregrad: z.string().optional(),
});
export type AbweichungErstellen = z.infer<typeof abweichungErstellenSchema>;

export const abweichungStatusSchema = z.object({
  status: z.enum(ABWEICHUNG_STATUS),
  bewertung: z.string().optional(),
  massnahmen: z.string().optional(),
  verantwortlich: z.string().optional(),
});
export type AbweichungStatusEingabe = z.infer<typeof abweichungStatusSchema>;
