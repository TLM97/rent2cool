'use client';

import { Feld, FormularRahmen } from '../../../components/formular';
import { legeFahrerAn } from '../aktionen';

export function FahrerFormular() {
  return (
    <FormularRahmen aktion={legeFahrerAn} sendenText="Fahrer anlegen">
      <Feld name="name" label="Name" pflicht breit autocomplete="off" />
      <Feld
        name="fuehrerscheinKlasse"
        label="Führerscheinklasse"
        pflicht
        hinweis="z. B. B, C1 oder C"
      />
      <Feld name="fuehrerscheinNummer" label="Führerscheinnummer" />
      <Feld name="fuehrerscheinGueltigBis" label="Führerschein gültig bis" typ="date" />
    </FormularRahmen>
  );
}
