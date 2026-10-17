'use client';

import type { KundeRolle } from '@rent2cool/shared';
import { Feld, FormularRahmen, GruppenFehler, Haken } from '../../../components/formular';
import type { Kunde } from '../../../lib/typen';
import { aendereUnternehmen, ladeEin } from '../aktionen';

export function UnternehmenFormular({
  kunde,
  version,
  freigegeben,
}: {
  kunde: Kunde;
  version: string;
  freigegeben: boolean;
}) {
  const identitaet = freigegeben
    ? 'Nach der Freigabe ändert Rent2Cool diese Angabe (erneute Prüfung) – bitte melden Sie sich bei uns.'
    : undefined;
  return (
    <FormularRahmen
      aktion={aendereUnternehmen}
      sendenText="Speichern"
      versteckt={{ version, freigegeben: freigegeben ? 'ja' : 'nein' }}
    >
      {freigegeben ? (
        <div className="feld breit">
          <span className="feld-titel">Firmenname · Handelsregister · USt-IdNr.</span>
          <p>
            {kunde.firmenname} · {kunde.handelsregisternummer ?? '–'} · {kunde.ustId ?? '–'}
          </p>
          <p className="feldhinweis">{identitaet}</p>
        </div>
      ) : (
        <>
          <Feld name="firmenname" label="Firmenname" pflicht breit standard={kunde.firmenname} />
          <Feld
            name="handelsregisternummer"
            label="Handelsregisternummer"
            standard={kunde.handelsregisternummer ?? ''}
          />
          <Feld name="ustId" label="USt-IdNr." standard={kunde.ustId ?? ''} />
        </>
      )}
      <Feld name="strasse" label="Straße und Hausnummer" breit standard={kunde.strasse ?? ''} />
      <Feld name="plz" label="PLZ" standard={kunde.plz ?? ''} />
      <Feld name="ort" label="Ort" standard={kunde.ort ?? ''} />
      <Feld
        name="nachweisEmail"
        label="E-Mail für Temperaturnachweise"
        typ="email"
        breit
        standard={kunde.nachweisEmail ?? ''}
        hinweis="Nach jeder Miete geht der gesiegelte Nachweis an diese Adresse."
      />
    </FormularRahmen>
  );
}

/** `rollen`: Aufgaben mit Beschreibung (vom Server, aus `@rent2cool/shared`). */
export function EinladungsFormular({ rollen }: { rollen: { wert: KundeRolle; text: string }[] }) {
  return (
    <FormularRahmen aktion={ladeEin} sendenText="Einladung senden">
      <Feld name="email" label="E-Mail-Adresse" typ="email" pflicht breit />
      {rollen.map((r) => (
        <Haken
          key={r.wert}
          name={`rolle_${r.wert}`}
          label={r.text}
          standard={r.wert !== 'kunde_admin'}
        />
      ))}
      <GruppenFehler name="rollen" />
    </FormularRahmen>
  );
}
