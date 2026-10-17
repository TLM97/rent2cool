'use server';

/**
 * Server Actions des Portals. Sie rufen ausschließlich die Kern-API mit dem
 * Token des angemeldeten Kunden auf; Rollen, Sichtbarkeit und Audit Trail
 * setzt der Kern durch (D-020). Kein Dienstkonto, keine Datenbank (D-002).
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  einladungSchema,
  fahrerErstellenSchema,
  mieteErstellenSchema,
  organisationAendernSchema,
  registrierungSchema,
  type KundeRolle,
} from '@rent2cool/shared';
import { ApiFehler } from '@rent2cool/oberflaeche/api-client';
import {
  berlinLokalZuIso,
  berlinTagesendeZuIso,
  feldFehlerAus,
  haken,
  text,
  werteAus,
  type FormularZustand,
} from '@rent2cool/oberflaeche/formular';
import { istUuid } from '@rent2cool/oberflaeche/seiten';
import { apiDelete, apiPatch, apiPost, holeIch, mitKunde } from '../../lib/api';
import { einladungsCode, IDENTITAETS_FELDER, rollenAusFormular } from '../../lib/portal';

const PRUEFEN = 'Bitte prüfen Sie die markierten Felder.';

function kernFehler(e: unknown, werte?: Record<string, string>): FormularZustand {
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
  // Rollenprüfung ohne eigene Meldung („Forbidden resource“) → verständlicher Text.
  if (e.status === 403 && /forbidden/i.test(e.message)) {
    return { fehler: 'Dafür fehlt Ihnen die Berechtigung.', werte };
  }
  return { fehler: e.message, werte };
}

function weiter(pfad: string, art: 'erfolg' | 'fehler', meldung: string): never {
  revalidatePath('/portal', 'layout');
  redirect(`${pfad}?${art}=${encodeURIComponent(meldung)}`);
}

/** Einfache Aktion (Knopf in einer Tabelle): Ergebnis als Meldung auf der Seite. */
async function knopf(pfad: string, ausfuehren: () => Promise<unknown>, erfolg: string) {
  let meldung: ['erfolg' | 'fehler', string];
  try {
    await ausfuehren();
    meldung = ['erfolg', erfolg];
  } catch (e) {
    meldung = ['fehler', kernFehler(e).fehler!];
  }
  weiter(pfad, ...meldung);
}

// --- Registrierung ---

export async function registriere(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const r = registrierungSchema.safeParse({
    firmenname: text(fd, 'firmenname') ?? '',
    handelsregisternummer: text(fd, 'handelsregisternummer'),
    ustId: text(fd, 'ustId'),
    strasse: text(fd, 'strasse'),
    plz: text(fd, 'plz'),
    ort: text(fd, 'ort'),
    land: (text(fd, 'land') ?? 'DE').toUpperCase(),
    nachweisEmail: text(fd, 'nachweisEmail'),
  });
  if (!r.success) return { fehler: PRUEFEN, feldFehler: feldFehlerAus(r.error), werte };
  try {
    await apiPost('/v1/registrierung', r.data);
  } catch (e) {
    // Doppelt abgeschickt (schlechtes Netz): schon zugeordnet → einfach weiter.
    if (e instanceof ApiFehler && e.status === 409 && (await holeIch()).kunde) {
      weiter('/portal', 'erfolg', 'Ihr Unternehmen ist bereits registriert.');
    }
    return kernFehler(e, werte);
  }
  weiter(
    '/portal',
    'erfolg',
    'Registrierung eingegangen. Wir prüfen Ihre Angaben und geben Ihr Unternehmen frei.',
  );
}

// --- Unternehmen ---

export async function aendereUnternehmen(
  _z: FormularZustand,
  fd: FormData,
): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const freigegeben = text(fd, 'freigegeben') === 'ja';
  const leer = (name: string) => text(fd, name) ?? null;
  const roh: Record<string, unknown> = {
    version: text(fd, 'version') ?? '',
    strasse: leer('strasse'),
    plz: leer('plz'),
    ort: leer('ort'),
    nachweisEmail: leer('nachweisEmail'),
  };
  // Nach der Freigabe ändert die Identität nur Rent2Cool – gar nicht erst senden.
  if (!freigegeben) {
    roh.firmenname = text(fd, 'firmenname') ?? '';
    for (const f of IDENTITAETS_FELDER.filter((f) => f !== 'firmenname')) roh[f] = leer(f);
  }
  const r = organisationAendernSchema.safeParse(roh);
  if (!r.success) return { fehler: PRUEFEN, feldFehler: feldFehlerAus(r.error), werte };
  try {
    await apiPatch('/v1/organisation', r.data);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter('/portal/organisation', 'erfolg', 'Unternehmensdaten gespeichert.');
}

// --- Einladungen und Mitglieder ---

export async function ladeEin(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const r = einladungSchema.safeParse({
    email: text(fd, 'email') ?? '',
    rollen: rollenAusFormular(fd),
  });
  if (!r.success) return { fehler: PRUEFEN, feldFehler: feldFehlerAus(r.error), werte };
  try {
    await apiPost('/v1/organisation/einladungen', r.data);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter('/portal/organisation', 'erfolg', `Einladung an ${r.data.email} verschickt.`);
}

export async function widerrufeEinladung(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '');
  if (!istUuid(id)) weiter('/portal/organisation', 'fehler', 'Einladung nicht gefunden.');
  await knopf(
    '/portal/organisation',
    () => apiDelete(`/v1/organisation/einladungen/${id}`),
    'Einladung widerrufen.',
  );
}

export async function aendereRollen(fd: FormData): Promise<void> {
  const kontoId = String(fd.get('kontoId') ?? '');
  const rollen: KundeRolle[] = rollenAusFormular(fd);
  if (rollen.length === 0) {
    weiter('/portal/organisation', 'fehler', 'Mindestens eine Aufgabe auswählen.');
  }
  await knopf(
    '/portal/organisation',
    () => apiPatch(`/v1/organisation/mitglieder/${encodeURIComponent(kontoId)}`, { rollen }),
    'Aufgaben geändert.',
  );
}

export async function entferneMitglied(fd: FormData): Promise<void> {
  const kontoId = String(fd.get('kontoId') ?? '');
  await knopf(
    '/portal/organisation',
    () => apiDelete(`/v1/organisation/mitglieder/${encodeURIComponent(kontoId)}`),
    'Person entfernt.',
  );
}

export async function nehmeEinladungAn(fd: FormData): Promise<void> {
  const code = einladungsCode(String(fd.get('code') ?? ''));
  if (!code) weiter('/einladung', 'fehler', 'Der Einladungslink ist unvollständig.');
  try {
    await apiPost('/v1/einladungen/annehmen', { token: code });
  } catch (e) {
    const f = kernFehler(e).fehler!;
    redirect(`/einladung?code=${code}&fehler=${encodeURIComponent(f)}`);
  }
  weiter('/portal', 'erfolg', 'Willkommen! Sie gehören jetzt zu diesem Unternehmen.');
}

// --- Buchen, Stornieren, Fahrer ---

/**
 * Buchung bestätigen. Der Kunde kommt aus dem Kern (`/v1/ich`), nie aus dem
 * Formular; der Kern prüft alle Regeln erneut und lehnt mit Gründen ab.
 * Ein Idempotency-Key je geöffnetem Formular verhindert Doppelbuchungen (D-003).
 */
export async function bucheMiete(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const ich = await mitKunde();
  const r = mieteErstellenSchema.safeParse({
    kundeId: ich.kunde.id,
    fahrzeugId: text(fd, 'fahrzeugId') ?? '',
    fahrerId: text(fd, 'fahrerId'),
    standortAbholId: text(fd, 'standortId'),
    standortRueckgabeId: text(fd, 'standortId'),
    startGeplant: berlinLokalZuIso(text(fd, 'start')) ?? '',
    endeGeplant: berlinLokalZuIso(text(fd, 'ende')) ?? '',
    auslandsfahrtGeplant: haken(fd, 'ausland'),
    temperaturprofil: text(fd, 'temperaturprofil'),
    idempotencyKey: text(fd, 'idempotencyKey'),
  });
  if (!r.success) return { fehler: PRUEFEN, feldFehler: feldFehlerAus(r.error), werte };
  let ergebnis: { id: string; idempotent: boolean };
  try {
    ergebnis = await apiPost<{ id: string; idempotent: boolean }>('/v1/mieten', r.data);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(
    `/portal/mieten/${ergebnis.id}`,
    'erfolg',
    ergebnis.idempotent ? 'Diese Buchung war bereits angelegt.' : 'Buchung bestätigt.',
  );
}

export async function storniereMiete(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '');
  if (!istUuid(id)) weiter('/portal/mieten', 'fehler', 'Miete nicht gefunden.');
  await knopf(
    `/portal/mieten/${id}`,
    () => apiPost(`/v1/mieten/${id}/status`, { status: 'storniert' }),
    'Buchung storniert.',
  );
}

export async function legeFahrerAn(_z: FormularZustand, fd: FormData): Promise<FormularZustand> {
  const werte = werteAus(fd);
  const ich = await mitKunde();
  const r = fahrerErstellenSchema.safeParse({
    name: text(fd, 'name') ?? '',
    fuehrerscheinKlasse: (text(fd, 'fuehrerscheinKlasse') ?? '').toUpperCase(),
    fuehrerscheinNummer: text(fd, 'fuehrerscheinNummer'),
    fuehrerscheinGueltigBis: berlinTagesendeZuIso(text(fd, 'fuehrerscheinGueltigBis')),
  });
  if (!r.success) return { fehler: PRUEFEN, feldFehler: feldFehlerAus(r.error), werte };
  try {
    await apiPost(`/v1/kunden/${ich.kunde.id}/fahrer`, r.data);
  } catch (e) {
    return kernFehler(e, werte);
  }
  weiter(
    '/portal/fahrer',
    'erfolg',
    `${r.data.name} angelegt. Rent2Cool prüft Identität und Führerschein, dann ist die Person buchbar.`,
  );
}
