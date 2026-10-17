/**
 * Reine Regeln der Portal-Oberfläche (ohne Next.js testbar). Die Oberfläche
 * blendet nur ein und aus – entscheiden tut der Kern.
 */
import type { KundeRolle } from '@rent2cool/shared';

/**
 * Kundenrollen wie in `@rent2cool/shared` (KUNDE_ROLLEN). Hier nur als
 * Typ-Import: Client-Komponenten dürfen das Paket nicht laden (Node-Module);
 * ein Test hält beide Listen gleich.
 */
export const ROLLEN = [
  'kunde_admin',
  'kunde_dispo',
  'kunde_qa',
] as const satisfies readonly KundeRolle[];

const INTERN = ['admin', 'ops', 'qa_approver', 'dpo'];

export function istIntern(rollen: readonly string[]): boolean {
  return rollen.some((r) => INTERN.includes(r));
}

export function hat(rollen: readonly string[], ...erlaubt: KundeRolle[]): boolean {
  return erlaubt.some((r) => rollen.includes(r));
}

export function istVerwalter(rollen: readonly string[]): boolean {
  return hat(rollen, 'kunde_admin');
}

export interface NavPunkt {
  href: string;
  text: string;
}

/** Navigation je nach Rollen im eigenen Unternehmen. */
export function navigation(rollen: readonly string[]): NavPunkt[] {
  const punkte: NavPunkt[] = [{ href: '/portal', text: 'Übersicht' }];
  if (hat(rollen, 'kunde_dispo', 'kunde_qa')) {
    punkte.push({ href: '/portal/mieten', text: 'Mieten & Nachweise' });
    punkte.push({ href: '/portal/rechnungen', text: 'Rechnungen' });
  }
  punkte.push({ href: '/portal/organisation', text: 'Unternehmen' });
  return punkte;
}

/** Aktiver Menüpunkt: genauer Treffer für die Übersicht, sonst Präfix. */
export function istAktiv(href: string, pfad: string): boolean {
  return href === '/portal' ? pfad === '/portal' : pfad === href || pfad.startsWith(`${href}/`);
}

/** Rollen aus Haken `rolle_<rolle>` (bekannte Rollen, Reihenfolge fest). */
export function rollenAusFormular(fd: FormData): KundeRolle[] {
  return ROLLEN.filter((r) => {
    const v = fd.get(`rolle_${r}`);
    return v === 'on' || v === 'true';
  });
}

/** Einladungscode aus dem Link (base64url, wie vom Kern erzeugt) – sonst `undefined`. */
export function einladungsCode(wert: string | string[] | undefined): string | undefined {
  const w = Array.isArray(wert) ? wert[0] : wert;
  return w && /^[A-Za-z0-9_-]{20,200}$/.test(w) ? w : undefined;
}

/** Nur relative Pfade als Rücksprungziel zulassen (kein Open Redirect). */
export function sicheresZiel(wert: string | undefined, standard = '/portal'): string {
  return wert && wert.startsWith('/') && !wert.startsWith('//') && !wert.startsWith('/\\')
    ? wert
    : standard;
}

/**
 * Felder, die der Kunde nach unserer Freigabe nicht mehr selbst ändert
 * (Identität; erneute Prüfung durch Rent2Cool).
 */
export const IDENTITAETS_FELDER = ['firmenname', 'handelsregisternummer', 'ustId'] as const;

/** Kurzbezeichnung der Aufgaben (Kopfzeile, Tabellen). */
export const AUFGABE_KURZ: Record<KundeRolle, string> = {
  kunde_admin: 'Verwaltung',
  kunde_dispo: 'Disposition',
  kunde_qa: 'Qualitätssicherung',
};

/** Bekannte Kundenrollen eines Logins als Kurztexte, in fester Reihenfolge. */
export function aufgaben(rollen: readonly string[]): string[] {
  return ROLLEN.filter((r) => rollen.includes(r)).map((r) => AUFGABE_KURZ[r]);
}

/** Art des elektronischen Siegels auf dem Nachweis-PDF (F-47). */
export const SIEGEL_TEXT: Record<'testsiegel' | 'zertifikat' | 'qualifiziert', string> = {
  testsiegel: 'Testsiegel (ohne Rechtswirkung)',
  zertifikat: 'elektronisches Siegel',
  qualifiziert: 'qualifiziertes elektronisches Siegel',
};
