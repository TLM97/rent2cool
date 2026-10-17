'use client';

import { Feld, FormularRahmen } from '../../../components/formular';
import { registriere } from '../aktionen';

export function RegistrierungsFormular() {
  return (
    <FormularRahmen aktion={registriere} sendenText="Unternehmen registrieren">
      <Feld name="firmenname" label="Firmenname" pflicht breit autocomplete="organization" />
      <Feld name="handelsregisternummer" label="Handelsregisternummer" hinweis="z. B. HRB 12345" />
      <Feld name="ustId" label="USt-IdNr." hinweis="z. B. DE123456789" />
      <Feld name="strasse" label="Straße und Hausnummer" breit autocomplete="street-address" />
      <Feld name="plz" label="PLZ" autocomplete="postal-code" />
      <Feld name="ort" label="Ort" autocomplete="address-level2" />
      <Feld name="land" label="Land (ISO, 2 Buchstaben)" standard="DE" />
      <Feld
        name="nachweisEmail"
        label="E-Mail für Temperaturnachweise"
        typ="email"
        breit
        hinweis="An diese Adresse (z. B. Ihre QA) schicken wir nach jeder Miete den gesiegelten Nachweis."
      />
    </FormularRahmen>
  );
}
