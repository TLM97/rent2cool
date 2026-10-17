'use server';

/**
 * Server Actions der Anlege-/Bearbeiten-Formulare (useActionState).
 * Ablauf je Aktion: Formular lesen → mit dem geteilten Schema prüfen
 * (@rent2cool/shared, dieselben Regeln wie der Kern) → Kern-API aufrufen →
 * bei Erfolg zur Detailseite. Rechte und Audit Trail setzt der Kern durch.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  abweichungErstellenSchema,
  abweichungStatusSchema,
  BEFEHL_NAME,
  fahrzeugBefehlSchema,
  fahrerAendernSchema,
  fahrerErstellenSchema,
  fahrzeugAendernSchema,
  fahrzeugErstellenSchema,
  kalibrierungSchema,
  kundeAendernSchema,
  kundeErstellenSchema,
  mieteErstellenSchema,
  rechnungErstellenSchema,
  schluesselAusstellenSchema,
  schluesselWiderrufenSchema,
  sensorTauschSchema,
  standortAendernSchema,
  standortErstellenSchema,
} from '@rent2cool/shared';
import { apiPatch, apiPost } from '../../lib/api';
import { ApiFehler } from '../../lib/api-client';
import {
  berlinLokalZuIso,
  berlinTagesendeZuIso,
  betrag,
  feldFehlerAus,
  haken,
  text,
  werteAus,
  type FormularZustand,
} from '../../lib/formular';
import { regelnAusFormular } from '../../lib/oeffnungszeiten';
import { istUuid } from '../../lib/seiten';

const PRUEFEN = 'Bitte die markierten Felder prüfen.';

interface Schema<T> {
  safeParse(
    wert: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
}

type Ergebnis<T> = { ok: true; daten: T } | { ok: false; zustand: FormularZustand };

function pruefe<T>(schema: Schema<T>, roh: unknown, werte: Record<string, string>): Ergebnis<T> {
  const r = schema.safeParse(roh);
  return r.success
    ? { ok: true, daten: r.data }
    : { ok: false, zustand: { fehler: PRUEFEN, feldFehler: feldFehlerAus(r.error), werte } };
}

/** Kern-Fehler (z. B. abgelehnte Buchung mit Gründen) in einen Formularzustand übersetzen. */
function kernFehler(e: unknown, werte: Record<string, string>): FormularZustand {
  if (!(e instanceof ApiFehler)) throw e; // u. a. Redirect zur Anmeldung weiterreichen
  const details = (e.details as { message?: { fehler?: unknown; gruende?: unknown } } | undefined)
    ?.message;
  if (details && typeof details === 'object' && Array.isArray(details.gruende)) {
    return {
      fehler: typeof details.fehler === 'string' ? details.fehler : e.message,
      liste: details.gruende.map(String),
      werte,
    };
  }
  if (e.status === 403) {
    return { fehler: 'Für diese Aktion fehlt Ihnen die Berechtigung.', werte };
  }
  return { fehler: e.message, werte };
}

/** Leeres Feld beim Ändern: `null` (= Feld leeren), nicht „unverändert“. */
function leer(fd: FormData, name: string): string | null {
  return text(fd, name) ?? null;
}

interface Aenderung {
  geaendert: string[];
}

function aenderungsMeldung(r: Aenderung): string {
  return r.geaendert.length === 0
    ? 'Keine Änderungen – nichts gespeichert.'
    : 'Änderungen gespeichert.';
}

function weiter(pfad: string, erfolg: string): never {
  revalidatePath('/', 'layout');
  redirect(`${pfad}?erfolg=${encodeURIComponent(erfolg)}`);
}

// --- Fahrzeug ---
export async function erstelleFahrzeug(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const roh = {
    kennzeichen: text(fd, 'kennzeichen') ?? '',
    vin: text(fd, 'vin'),
    standortId: text(fd, 'standortId'),
    zulGesamtmasseKg: text(fd, 'zulGesamtmasseKg') ?? '',
    benoetigteFuehrerscheinklasse: text(fd, 'benoetigteFuehrerscheinklasse') ?? 'B',
    hatFahrtenschreiber: haken(fd, 'hatFahrtenschreiber'),
    standardTemperaturprofil: text(fd, 'standardTemperaturprofil'),
    aggregat: haken(fd, 'mitAufbau')
      ? {
          typ: text(fd, 'aggregatTyp'),
          hersteller: text(fd, 'aggregatHersteller'),
          seriennummer: text(fd, 'aggregatSeriennummer'),
          sensoren: [
            {
              messgroesse: 'temperatur_laderaum',
              einheit: 'C',
              modell: text(fd, 'sensorModell'),
              seriennummer: text(fd, 'sensorSeriennummer'),
            },
          ],
        }
      : undefined,
  };
  const p = pruefe(fahrzeugErstellenSchema, roh, werte);
  if (!p.ok) return p.zustand;
  let id: string;
  try {
    ({ id } = await apiPost<{ id: string }>('/v1/fahrzeuge', p.daten));
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/fahrzeuge/${id}`, 'Fahrzeug angelegt.');
}

export async function aendereFahrzeug(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const id = text(fd, 'id') ?? '';
  if (!istUuid(id)) return { fehler: 'Fahrzeug fehlt.', werte };
  const roh = {
    version: text(fd, 'version') ?? '',
    kennzeichen: text(fd, 'kennzeichen') ?? '',
    vin: leer(fd, 'vin'),
    zulGesamtmasseKg: text(fd, 'zulGesamtmasseKg') ?? '',
    benoetigteFuehrerscheinklasse: text(fd, 'benoetigteFuehrerscheinklasse') ?? '',
    hatFahrtenschreiber: haken(fd, 'hatFahrtenschreiber'),
    standardTemperaturprofil: leer(fd, 'standardTemperaturprofil'),
    standortId: leer(fd, 'standortId'),
  };
  const p = pruefe(fahrzeugAendernSchema, roh, werte);
  if (!p.ok) return p.zustand;
  let r: Aenderung;
  try {
    r = await apiPatch<Aenderung>(`/v1/fahrzeuge/${id}`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/fahrzeuge/${id}`, aenderungsMeldung(r));
}

export async function erfasseKalibrierung(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const fahrzeugId = text(fd, 'fahrzeugId') ?? '';
  const sensorId = text(fd, 'sensorId') ?? '';
  if (!istUuid(sensorId)) {
    return { fehler: PRUEFEN, feldFehler: { sensorId: 'Sensor auswählen' }, werte };
  }
  const roh = {
    durchgefuehrtAm: berlinLokalZuIso(text(fd, 'durchgefuehrtAm')) ?? '',
    gueltigBis: berlinTagesendeZuIso(text(fd, 'gueltigBis')) ?? '',
    pruefstelle: text(fd, 'pruefstelle'),
    zertifikatRef: text(fd, 'zertifikatRef'),
    ergebnis: text(fd, 'ergebnis'),
  };
  const p = pruefe(kalibrierungSchema, roh, werte);
  if (!p.ok) return p.zustand;
  try {
    await apiPost(`/v1/sensoren/${sensorId}/kalibrierungen`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(istUuid(fahrzeugId) ? `/fahrzeuge/${fahrzeugId}` : '/fahrzeuge', 'Kalibrierung erfasst.');
}

export async function tauscheSensor(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const fahrzeugId = text(fd, 'fahrzeugId') ?? '';
  const sensorId = text(fd, 'sensorId') ?? '';
  if (!istUuid(fahrzeugId) || !istUuid(sensorId)) return { fehler: 'Sensor fehlt.', werte };
  const kalibrierung = haken(fd, 'mitKalibrierung')
    ? {
        durchgefuehrtAm: berlinLokalZuIso(text(fd, 'durchgefuehrtAm')) ?? '',
        gueltigBis: berlinTagesendeZuIso(text(fd, 'gueltigBis')) ?? '',
        pruefstelle: text(fd, 'pruefstelle'),
        zertifikatRef: text(fd, 'zertifikatRef'),
        ergebnis: text(fd, 'ergebnis'),
      }
    : undefined;
  const roh = {
    seriennummer: text(fd, 'seriennummer') ?? '',
    modell: text(fd, 'modell'),
    grund: text(fd, 'grund') ?? '',
    kalibrierung,
  };
  const p = pruefe(sensorTauschSchema, roh, werte);
  if (!p.ok) {
    // Fehler der Kalibrierung („kalibrierung.gueltigBis“) dem Formularfeld zuordnen.
    const feldFehler = Object.fromEntries(
      Object.entries(p.zustand.feldFehler ?? {}).map(([k, v]) => [
        k.replace(/^kalibrierung\./, ''),
        v,
      ]),
    );
    return { ...p.zustand, feldFehler };
  }
  try {
    await apiPost(`/v1/sensoren/${sensorId}/tausch`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(
    `/fahrzeuge/${fahrzeugId}`,
    p.daten.kalibrierung
      ? 'Sensor getauscht und kalibriert.'
      : 'Sensor getauscht. Ohne Kalibrierung ist das Fahrzeug nicht buchbar.',
  );
}

// --- Standort (D-011) ---
function standortRoh(fd: FormData) {
  return {
    name: text(fd, 'name') ?? '',
    strasse: leer(fd, 'strasse'),
    plz: leer(fd, 'plz'),
    ort: leer(fd, 'ort'),
    land: text(fd, 'land') ?? 'DE',
    region: leer(fd, 'region'),
    geofenceLat: leer(fd, 'geofenceLat'),
    geofenceLng: leer(fd, 'geofenceLng'),
    geofenceRadiusM: leer(fd, 'geofenceRadiusM'),
  };
}

export async function erstelleStandort(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const oz = regelnAusFormular(werte);
  if (!oz.ok) return { fehler: PRUEFEN, feldFehler: oz.feldFehler, werte };
  const p = pruefe(
    standortErstellenSchema,
    { ...standortRoh(fd), oeffnungsregeln: oz.regeln },
    werte,
  );
  if (!p.ok) return p.zustand;
  let id: string;
  try {
    ({ id } = await apiPost<{ id: string }>('/v1/standorte', p.daten));
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/standorte/${id}`, 'Standort angelegt.');
}

export async function aendereStandort(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const id = text(fd, 'id') ?? '';
  if (!istUuid(id)) return { fehler: 'Standort fehlt.', werte };
  const oz = regelnAusFormular(werte);
  if (!oz.ok) return { fehler: PRUEFEN, feldFehler: oz.feldFehler, werte };
  const roh = {
    version: text(fd, 'version') ?? '',
    ...standortRoh(fd),
    oeffnungsregeln: oz.regeln,
  };
  const p = pruefe(standortAendernSchema, roh, werte);
  if (!p.ok) return p.zustand;
  let r: Aenderung;
  try {
    r = await apiPatch<Aenderung>(`/v1/standorte/${id}`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/standorte/${id}`, aenderungsMeldung(r));
}

// --- Kunde & Fahrer ---
export async function erstelleKunde(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const roh = {
    firmenname: text(fd, 'firmenname') ?? '',
    handelsregisternummer: text(fd, 'handelsregisternummer'),
    ustId: text(fd, 'ustId'),
    strasse: text(fd, 'strasse'),
    plz: text(fd, 'plz'),
    ort: text(fd, 'ort'),
    land: text(fd, 'land') ?? 'DE',
  };
  const p = pruefe(kundeErstellenSchema, roh, werte);
  if (!p.ok) return p.zustand;
  let id: string;
  try {
    ({ id } = await apiPost<{ id: string }>('/v1/kunden', p.daten));
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/kunden/${id}`, 'Kunde angelegt. Nächster Schritt: Prüfung (Handelsregister/USt-ID).');
}

export async function aendereKunde(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const id = text(fd, 'id') ?? '';
  if (!istUuid(id)) return { fehler: 'Kunde fehlt.', werte };
  const roh = {
    version: text(fd, 'version') ?? '',
    firmenname: text(fd, 'firmenname') ?? '',
    handelsregisternummer: leer(fd, 'handelsregisternummer'),
    ustId: leer(fd, 'ustId'),
    strasse: leer(fd, 'strasse'),
    plz: leer(fd, 'plz'),
    ort: leer(fd, 'ort'),
    land: text(fd, 'land') ?? '',
  };
  const p = pruefe(kundeAendernSchema, roh, werte);
  if (!p.ok) return p.zustand;
  let r: Aenderung;
  try {
    r = await apiPatch<Aenderung>(`/v1/kunden/${id}`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/kunden/${id}`, aenderungsMeldung(r));
}

export async function erstelleFahrer(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const kundeId = text(fd, 'kundeId') ?? '';
  if (!istUuid(kundeId)) return { fehler: 'Kunde fehlt.', werte };
  const roh = {
    name: text(fd, 'name') ?? '',
    fuehrerscheinKlasse: text(fd, 'fuehrerscheinKlasse') ?? '',
    fuehrerscheinNummer: text(fd, 'fuehrerscheinNummer'),
    fuehrerscheinGueltigBis: berlinTagesendeZuIso(text(fd, 'fuehrerscheinGueltigBis')),
  };
  if (text(fd, 'fuehrerscheinGueltigBis') && !roh.fuehrerscheinGueltigBis) {
    return { fehler: PRUEFEN, feldFehler: { fuehrerscheinGueltigBis: 'Ungültiges Datum' }, werte };
  }
  const p = pruefe(fahrerErstellenSchema, roh, werte);
  if (!p.ok) return p.zustand;
  try {
    await apiPost(`/v1/kunden/${kundeId}/fahrer`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(
    `/kunden/${kundeId}`,
    'Fahrer angelegt. Nächster Schritt: Identitäts- und Führerscheinprüfung.',
  );
}

export async function aendereFahrer(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const id = text(fd, 'id') ?? '';
  const kundeId = text(fd, 'kundeId') ?? '';
  if (!istUuid(id) || !istUuid(kundeId)) return { fehler: 'Fahrer fehlt.', werte };
  const datum = text(fd, 'fuehrerscheinGueltigBis');
  const gueltigBis = berlinTagesendeZuIso(datum);
  if (datum && !gueltigBis) {
    return { fehler: PRUEFEN, feldFehler: { fuehrerscheinGueltigBis: 'Ungültiges Datum' }, werte };
  }
  const roh = {
    version: text(fd, 'version') ?? '',
    name: text(fd, 'name') ?? '',
    fuehrerscheinKlasse: text(fd, 'fuehrerscheinKlasse') ?? '',
    fuehrerscheinNummer: leer(fd, 'fuehrerscheinNummer'),
    fuehrerscheinGueltigBis: gueltigBis ?? null,
    kontoId: leer(fd, 'kontoId'),
  };
  const p = pruefe(fahrerAendernSchema, roh, werte);
  if (!p.ok) return p.zustand;
  let r: Aenderung;
  try {
    r = await apiPatch<Aenderung>(`/v1/fahrer/${id}`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/kunden/${kundeId}`, aenderungsMeldung(r));
}

// --- Buchung ---
export async function erstelleMiete(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const roh = {
    kundeId: text(fd, 'kundeId') ?? '',
    fahrzeugId: text(fd, 'fahrzeugId') ?? '',
    fahrerId: text(fd, 'fahrerId'),
    standortAbholId: text(fd, 'standortAbholId'),
    standortRueckgabeId: text(fd, 'standortRueckgabeId'),
    startGeplant: berlinLokalZuIso(text(fd, 'startGeplant')) ?? '',
    endeGeplant: berlinLokalZuIso(text(fd, 'endeGeplant')) ?? '',
    auslandsfahrtGeplant: haken(fd, 'auslandsfahrtGeplant'),
    temperaturprofil: text(fd, 'temperaturprofil'),
    idempotencyKey: text(fd, 'idempotencyKey'),
  };
  const p = pruefe(mieteErstellenSchema, roh, werte);
  if (!p.ok) return p.zustand;
  let ergebnis: { id: string; idempotent: boolean };
  try {
    ergebnis = await apiPost<{ id: string; idempotent: boolean }>('/v1/mieten', p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(
    `/mieten/${ergebnis.id}`,
    ergebnis.idempotent ? 'Diese Buchung war bereits angelegt.' : 'Buchung bestätigt.',
  );
}

// --- Digitaler Schlüssel und Fernzugriff (D-014) ---
export async function stelleSchluesselAus(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const mieteId = text(fd, 'mieteId') ?? '';
  if (!istUuid(mieteId)) return { fehler: 'Miete fehlt.', werte };
  const p = pruefe(schluesselAusstellenSchema, { fahrerId: text(fd, 'fahrerId') ?? '' }, werte);
  if (!p.ok) return p.zustand;
  let r: { idempotent: boolean };
  try {
    r = await apiPost<{ idempotent: boolean }>(`/v1/mieten/${mieteId}/schluessel`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(
    `/mieten/${mieteId}`,
    r.idempotent ? 'Dieser Fahrer hat bereits einen gültigen Schlüssel.' : 'Schlüssel ausgestellt.',
  );
}

export async function widerrufeSchluessel(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const id = text(fd, 'id') ?? '';
  const mieteId = text(fd, 'mieteId') ?? '';
  if (!istUuid(id) || !istUuid(mieteId)) return { fehler: 'Schlüssel fehlt.', werte };
  const p = pruefe(schluesselWiderrufenSchema, { grund: text(fd, 'grund') ?? '' }, werte);
  if (!p.ok) return p.zustand;
  try {
    await apiPost(`/v1/schluessel/${id}/widerruf`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/mieten/${mieteId}`, 'Schlüssel widerrufen.');
}

/** Befehl durch den Betrieb. Fehlschlag oder Ablehnung bleibt im Formular stehen. */
export async function sendeFahrzeugBefehl(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const fahrzeugId = text(fd, 'fahrzeugId') ?? '';
  if (!istUuid(fahrzeugId)) return { fehler: 'Fahrzeug fehlt.', werte };
  const roh = {
    befehl: text(fd, 'befehl') ?? '',
    grund: text(fd, 'grund') ?? '',
    idempotencyKey: text(fd, 'idempotencyKey') ?? '',
  };
  const p = pruefe(fahrzeugBefehlSchema, roh, werte);
  if (!p.ok) return p.zustand;
  const name = BEFEHL_NAME[p.daten.befehl];
  let b: { status: string; gruende: string[] | null };
  try {
    b = await apiPost<{ status: string; gruende: string[] | null }>(
      `/v1/fahrzeuge/${fahrzeugId}/befehle`,
      p.daten,
    );
  } catch (e) {
    revalidatePath('/', 'layout'); // auch Ablehnungen stehen im Protokoll
    return kernFehler(e, werte);
  }
  if (b.status === 'fehlgeschlagen') {
    revalidatePath('/', 'layout');
    return { fehler: `${name} fehlgeschlagen.`, liste: b.gruende ?? [], werte };
  }
  weiter(
    `/fahrzeuge/${fahrzeugId}`,
    b.status === 'ausgefuehrt'
      ? `${name} ausgeführt.`
      : `${name} gesendet – Bestätigung des Fahrzeugs steht aus.`,
  );
}

// --- Rechnung ---
export async function erstelleRechnung(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const roh = {
    mieteId: text(fd, 'mieteId') ?? '',
    netto: betrag(fd, 'netto') ?? '',
    steuerSatz: text(fd, 'steuerSatz'),
  };
  const p = pruefe(rechnungErstellenSchema, roh, werte);
  if (!p.ok) return p.zustand;
  let id: string;
  try {
    ({ id } = await apiPost<{ id: string }>('/v1/rechnungen', p.daten));
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/rechnungen/${id}`, 'Rechnung als Entwurf angelegt.');
}

// --- Abweichung ---
export async function erstelleAbweichung(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const roh = {
    bezugTyp: text(fd, 'bezugTyp') ?? '',
    bezugId: text(fd, 'bezugId') ?? '',
    beschreibung: text(fd, 'beschreibung') ?? '',
    schweregrad: text(fd, 'schweregrad'),
  };
  const p = pruefe(abweichungErstellenSchema, roh, werte);
  if (!p.ok) return p.zustand;
  let id: string;
  try {
    ({ id } = await apiPost<{ id: string }>('/v1/abweichungen', p.daten));
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/abweichungen/${id}`, 'Abweichung erfasst.');
}

export async function bewerteAbweichung(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const id = text(fd, 'id') ?? '';
  if (!istUuid(id)) return { fehler: 'Abweichung fehlt.', werte };
  const roh = {
    status: text(fd, 'status') ?? '',
    bewertung: text(fd, 'bewertung'),
    massnahmen: text(fd, 'massnahmen'),
    verantwortlich: text(fd, 'verantwortlich'),
  };
  const p = pruefe(abweichungStatusSchema, roh, werte);
  if (!p.ok) return p.zustand;
  try {
    await apiPost(`/v1/abweichungen/${id}/status`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/abweichungen/${id}`, 'Abweichung aktualisiert.');
}
