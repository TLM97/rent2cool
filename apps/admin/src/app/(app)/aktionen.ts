'use server';

/**
 * Server Actions der Oberfläche. Sie rufen ausschließlich die Kern-API auf;
 * Rollenprüfung und Audit Trail passieren dort (T-004). Ergebnis bzw. Fehler
 * gehen per Query-Parameter an die Seite zurück.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiPost } from '../../lib/api';
import { ApiFehler } from '../../lib/api-client';
import { statusLabel } from '../../lib/format';
import { istUuid } from '../../lib/seiten';

function zurueckPfad(formData: FormData, standard: string): string {
  const z = formData.get('zurueck');
  return typeof z === 'string' && z.startsWith('/') && !z.startsWith('//') ? z : standard;
}

function mitMeldung(pfad: string, art: 'fehler' | 'erfolg', text: string): string {
  const [basis, query] = pfad.split('?');
  const q = new URLSearchParams(query);
  q.delete('fehler');
  q.delete('erfolg');
  q.set(art, text);
  return `${basis}?${q.toString()}`;
}

async function ausfuehren(
  pfad: string,
  body: unknown,
  zurueck: string,
  erfolg: string,
): Promise<never> {
  let ziel: string;
  try {
    await apiPost(pfad, body);
    revalidatePath('/', 'layout');
    ziel = mitMeldung(zurueck, 'erfolg', erfolg);
  } catch (e) {
    if (!(e instanceof ApiFehler)) throw e; // u. a. Redirect zur Anmeldung
    ziel = mitMeldung(zurueck, 'fehler', e.message);
  }
  redirect(ziel);
}

export async function quittiereAlarm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const zurueck = zurueckPfad(formData, '/alarme');
  if (!istUuid(id)) redirect(mitMeldung(zurueck, 'fehler', 'Ungültige Alarm-ID'));
  await ausfuehren(`/v1/alarme/${id}/quittieren`, {}, zurueck, 'Alarm quittiert.');
}

export async function schliesseAlarm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const zurueck = zurueckPfad(formData, '/alarme');
  if (!istUuid(id)) redirect(mitMeldung(zurueck, 'fehler', 'Ungültige Alarm-ID'));
  await ausfuehren(`/v1/alarme/${id}/schliessen`, {}, zurueck, 'Alarm geschlossen.');
}

export async function aendereFahrzeugStatus(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const zurueck = `/fahrzeuge/${istUuid(id) ? id : ''}`;
  if (!istUuid(id) || !status) redirect(mitMeldung('/fahrzeuge', 'fehler', 'Ungültige Eingabe'));
  await ausfuehren(
    `/v1/fahrzeuge/${id}/status`,
    { status },
    zurueck,
    `Status auf „${statusLabel(status)}“ gesetzt.`,
  );
}

/** Gemeinsamer Statuswechsel: `<basis>/<id>/status` im Kern, zurück zur Detailseite. */
async function statusWechsel(
  formData: FormData,
  kernBasis: string,
  seitenBasis: string,
): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const zurueck = zurueckPfad(formData, istUuid(id) ? `${seitenBasis}/${id}` : seitenBasis);
  if (!istUuid(id) || !status) redirect(mitMeldung(zurueck, 'fehler', 'Ungültige Eingabe'));
  await ausfuehren(
    `${kernBasis}/${id}/status`,
    { status },
    zurueck,
    `Status auf „${statusLabel(status)}“ gesetzt.`,
  );
}

export async function aendereKundeStatus(formData: FormData): Promise<void> {
  await statusWechsel(formData, '/v1/kunden', '/kunden');
}

export async function aendereFahrerStatus(formData: FormData): Promise<void> {
  // Fahrer haben keine eigene Seite; Rückweg über das Feld „zurueck“ (Kundenseite).
  await statusWechsel(formData, '/v1/fahrer', '/kunden');
}

export async function aendereMieteStatus(formData: FormData): Promise<void> {
  await statusWechsel(formData, '/v1/mieten', '/mieten');
}

export async function aendereRechnungStatus(formData: FormData): Promise<void> {
  await statusWechsel(formData, '/v1/rechnungen', '/rechnungen');
}
