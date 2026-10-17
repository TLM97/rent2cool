'use client';

import { Auswahl, FormularRahmen } from '../../../components/formular';
import { bucheMiete } from '../aktionen';

/** Letzter Schritt: bestätigen. Alle Angaben der Suche reisen als versteckte Felder mit. */
export function BuchungsFormular({
  versteckt,
  profile,
  standardProfil,
}: {
  versteckt: Record<string, string>;
  profile: { wert: string; text: string }[];
  standardProfil: string;
}) {
  return (
    <FormularRahmen aktion={bucheMiete} sendenText="Verbindlich buchen" versteckt={versteckt}>
      <Auswahl
        name="temperaturprofil"
        label="Temperaturprofil"
        standard={standardProfil}
        leer="Standard des Fahrzeugs"
        optionen={profile}
      />
    </FormularRahmen>
  );
}
