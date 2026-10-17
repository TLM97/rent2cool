/** Anzeige des Temperaturnachweis-Archivs (Versionen, Echtheitsprüfung). */

export interface PruefungKurz {
  ergebnis: 'echt' | 'abweichung';
  hinweise: string[];
}

/** Ergebnis der Echtheitsprüfung als ein Satz für die Meldungszeile. */
export function pruefungsText(version: string, p: PruefungKurz): string {
  const v = version ? `Version ${version}` : 'Nachweis';
  if (p.ergebnis === 'echt') {
    return p.hinweise.length === 0
      ? `${v} ist echt: Dateien unverändert, Signaturen gültig, Messdaten unverändert.`
      : `${v} ist echt (Dateien unverändert, Signaturen gültig). Hinweis: ${p.hinweise.join(' ')}`;
  }
  return `${v}: Abweichung – ${p.hinweise.join('; ')}`;
}

/** Siegel des PDF (F-47); das Testsiegel ist ein Platzhalter ohne Rechtswirkung. */
export const SIEGEL_TEXT: Record<string, string> = {
  testsiegel: 'Testsiegel',
  zertifikat: 'gesiegelt',
  qualifiziert: 'qualifiziert gesiegelt',
};

export const AUSLOESER_TEXT: Record<string, string> = {
  automatisch: 'automatisch nach Mietende',
  manuell: 'manuell angefordert',
};
