import type { Metadata } from 'next';
import { Seitenkopf } from '../../../../components/bausteine';
import { Feld, FormularRahmen } from '../../../../components/formular';
import { erstelleKunde } from '../../formulare';

export const metadata: Metadata = { title: 'Kunde anlegen' };

export default function KundeNeu() {
  return (
    <>
      <Seitenkopf
        titel="Kunde anlegen"
        untertitel="Nur Firmenkunden (D-010). Der Kunde startet im Status „angelegt“ und muss vor der ersten Buchung geprüft und freigegeben werden."
        brotkrume={{ href: '/kunden', text: 'Kunden & Fahrer' }}
      />
      <section className="karte">
        <FormularRahmen aktion={erstelleKunde} sendenText="Kunde anlegen" abbrechenHref="/kunden">
          <Feld name="firmenname" label="Firmenname" pflicht breit />
          <Feld name="handelsregisternummer" label="Handelsregisternummer" hinweis="z. B. HRB 12345 B" />
          <Feld name="ustId" label="USt-ID" hinweis="z. B. DE123456789" />
          <Feld name="strasse" label="Straße und Hausnummer" breit />
          <Feld name="plz" label="PLZ" />
          <Feld name="ort" label="Ort" />
          <Feld name="land" label="Land (ISO)" standard="DE" />
        </FormularRahmen>
      </section>
    </>
  );
}
