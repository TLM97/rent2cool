import type { Metadata } from 'next';
import { Seitenkopf } from '../../../../components/bausteine';
import { FormularRahmen } from '../../../../components/formular';
import { KundeFelder } from '../../../../components/stammdaten';
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
          <KundeFelder />
        </FormularRahmen>
      </section>
    </>
  );
}
