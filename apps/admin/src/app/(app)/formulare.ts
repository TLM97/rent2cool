'use server';

/**
 * Server Actions der Anlege-/Bearbeiten-Formulare (useActionState).
 * Ablauf je Aktion: Formular lesen → mit dem geteilten Schema prüfen
 * (@rent2cool/shared, dieselben Regeln wie der Kern) → Kern-API aufrufen →
 * bei Erfolg zur Detailseite. Rechte und Audit Trail setzt der Kern durch.
 */
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  abweichungErstellenSchema,
  abweichungStatusSchema,
  BEFEHL_NAME,
  fahrzeugBefehlSchema,
  FOTO_MAX_BYTES,
  FOTO_TYPEN,
  fotoAnfordernSchema,
  PROTOKOLL_ART_NAME,
  PROTOKOLL_ARTEN,
  protokollAendernSchema,
  type ProtokollArt,
  fahrerAendernSchema,
  fahrerErstellenSchema,
  fahrzeugAendernSchema,
  fahrzeugErstellenSchema,
  kalibrierungSchema,
  kundeAendernSchema,
  kundeErstellenSchema,
  kundeKontoSchema,
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
import { checklisteAusFormular, feldName, schaedenAusText } from '../../lib/protokoll';
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
    nachweisEmail: text(fd, 'nachweisEmail'),
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
    nachweisEmail: leer(fd, 'nachweisEmail'),
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

// --- Logins des Kunden (F-41) ---
export async function ordneKundenLoginZu(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const kundeId = text(fd, 'kundeId') ?? '';
  if (!istUuid(kundeId)) return { fehler: 'Kunde fehlt.', werte };
  const p = pruefe(
    kundeKontoSchema,
    {
      kontoId: text(fd, 'kontoId') ?? '',
      bezeichnung: text(fd, 'bezeichnung'),
      rollen: (['kunde_admin', 'kunde_dispo', 'kunde_qa'] as const).filter((r) =>
        haken(fd, `rolle_${r}`),
      ),
    },
    werte,
  );
  if (!p.ok) return p.zustand;
  try {
    await apiPost(`/v1/kunden/${kundeId}/konten`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/kunden/${kundeId}`, 'Login zugeordnet – er sieht ab sofort die Daten dieses Kunden.');
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

// --- Übergabeprotokoll (Ausnahmeprozess mit Personal, D-014) ---
function protokollKontext(fd: FormData) {
  const mieteId = text(fd, 'mieteId') ?? '';
  const protokollId = text(fd, 'protokollId') ?? '';
  const art = text(fd, 'art') as ProtokollArt | undefined;
  const gueltig =
    istUuid(mieteId) && (protokollId === '' || istUuid(protokollId)) && art !== undefined;
  return gueltig && (PROTOKOLL_ARTEN as readonly string[]).includes(art)
    ? { mieteId, protokollId, art }
    : null;
}

export async function legeProtokollAn(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const k = protokollKontext(fd);
  if (!k) return { fehler: 'Miete fehlt.', werte };
  try {
    await apiPost(`/v1/mieten/${k.mieteId}/protokolle`, { art: k.art });
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/mieten/${k.mieteId}`, `${PROTOKOLL_ART_NAME[k.art]}protokoll angelegt.`);
}

/**
 * Foto hochladen wie die App: Prüfsumme bilden, beim Kern anfordern, direkt in
 * den Objektspeicher laden, Kern prüfen lassen.
 */
export async function ladeProtokollFotoHoch(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const k = protokollKontext(fd);
  if (!k || !k.protokollId) return { fehler: 'Protokoll fehlt.', werte };
  const feld = feldName(k.art, 'foto');
  const datei = fd.get(feld);
  if (!(datei instanceof File) || datei.size === 0) {
    return { fehler: PRUEFEN, feldFehler: { [feld]: 'Bitte ein Foto wählen' }, werte };
  }
  if (!(FOTO_TYPEN as readonly string[]).includes(datei.type)) {
    return { fehler: PRUEFEN, feldFehler: { [feld]: 'Nur JPEG, PNG oder WebP' }, werte };
  }
  if (datei.size > FOTO_MAX_BYTES) {
    return { fehler: PRUEFEN, feldFehler: { [feld]: 'Höchstens 15 MB' }, werte };
  }
  const daten = Buffer.from(await datei.arrayBuffer());
  const p = pruefe(
    fotoAnfordernSchema,
    {
      perspektive: text(fd, feldName(k.art, 'perspektive')) ?? '',
      contentType: datei.type,
      groesse: daten.length,
      sha256: createHash('sha256').update(daten).digest('hex'),
      idempotencyKey: text(fd, 'idempotencyKey') ?? '',
    },
    werte,
  );
  if (!p.ok) return p.zustand;
  try {
    const r = await apiPost<{
      foto: { id: string; status: string };
      upload: { url: string; kopfzeilen: Record<string, string> } | null;
    }>(`/v1/protokolle/${k.protokollId}/fotos`, p.daten);
    if (r.upload) {
      const put = await fetch(r.upload.url, {
        method: 'PUT',
        body: daten,
        headers: r.upload.kopfzeilen,
      });
      if (!put.ok) {
        return { fehler: `Hochladen in den Objektspeicher fehlgeschlagen (${put.status}).`, werte };
      }
    }
    await apiPost(`/v1/protokolle/${k.protokollId}/fotos/${r.foto.id}/bestaetigung`);
  } catch (e) {
    revalidatePath('/', 'layout');
    return kernFehler(e, werte);
  }
  weiter(`/mieten/${k.mieteId}`, 'Foto gespeichert.');
}

export async function speichereProtokoll(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const k = protokollKontext(fd);
  if (!k || !k.protokollId) return { fehler: 'Protokoll fehlt.', werte };
  const kmFeld = feldName(k.art, 'kmStand');
  const p = pruefe(
    protokollAendernSchema,
    {
      version: text(fd, 'version') ?? '',
      kmStand: text(fd, kmFeld) ?? null,
      checkliste: checklisteAusFormular(k.art, (n) => text(fd, n)),
      schaeden:
        (text(fd, feldName(k.art, 'schaeden')) ?? '') === (text(fd, 'schaedenVorher') ?? '')
          ? undefined
          : schaedenAusText(text(fd, feldName(k.art, 'schaeden'))),
    },
    werte,
  );
  if (!p.ok) {
    // Feldfehler „kmStand“ dem präfixierten Formularfeld zuordnen.
    const ff = p.zustand.feldFehler ?? {};
    return { ...p.zustand, feldFehler: ff.kmStand ? { [kmFeld]: ff.kmStand } : ff };
  }
  let r: Aenderung;
  try {
    r = await apiPatch<Aenderung>(`/v1/protokolle/${k.protokollId}`, p.daten);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/mieten/${k.mieteId}`, aenderungsMeldung(r));
}

export async function schliesseProtokollAb(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const k = protokollKontext(fd);
  if (!k || !k.protokollId) return { fehler: 'Protokoll fehlt.', werte };
  try {
    await apiPost(`/v1/protokolle/${k.protokollId}/abschluss`);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(`/mieten/${k.mieteId}`, `${PROTOKOLL_ART_NAME[k.art]}protokoll abgeschlossen.`);
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
