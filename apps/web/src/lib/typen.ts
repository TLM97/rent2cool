/**
 * Antwortformen der Kern-API, wie das Portal sie nutzt (Zeitpunkte als
 * ISO-Strings). Bewusst schmal – nur die angezeigten Felder.
 */
import type { KundeRolle } from '@rent2cool/shared';

export interface Liste<T> {
  eintraege: T[];
  gesamt: number;
  limit: number;
  offset: number;
}

export interface Ich {
  akteurId: string;
  name: string | null;
  rollen: string[];
  kunde: { id: string; firmenname: string } | null;
  hinweis: string | null;
}

export interface Kunde {
  id: string;
  firmenname: string;
  ustId: string | null;
  handelsregisternummer: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
  nachweisEmail: string | null;
  status: string;
}

export interface Mitglied {
  kontoId: string;
  email: string | null;
  bezeichnung: string | null;
  rollen: KundeRolle[];
  erstelltAm: string;
}

export interface OffeneEinladung {
  id: string;
  email: string;
  rollen: KundeRolle[];
  gueltigBis: string;
  erstelltAm: string;
}

export interface Organisation {
  kunde: Kunde;
  version: string;
  freigegeben: boolean;
  mitglieder: Mitglied[];
  einladungen: OffeneEinladung[];
}

export interface Miete {
  id: string;
  fahrzeugId: string;
  startGeplant: string;
  endeGeplant: string;
  startIst: string | null;
  endeIst: string | null;
  temperaturprofil: string | null;
  status: string;
  fahrzeugKennzeichen?: string;
}

export interface NachweisArchivEintrag {
  id: string;
  version: number;
  erzeugtAm: string;
  bewertung: string;
  anzahlGrenzverletzungen: number;
  anzahlLuecken: number;
  pdfSha256: string;
  siegelArt: 'testsiegel' | 'zertifikat' | 'qualifiziert' | null;
  jsonUrl: string;
  pdfUrl: string;
}

export interface Rechnung {
  id: string;
  rechnungsnummer: string;
  mieteId: string;
  zeitraumVon: string;
  zeitraumBis: string;
  bruttoCent: number;
  waehrung: string;
  status: string;
  gestelltAm: string | null;
}
