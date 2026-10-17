import type { Metadata } from 'next';
import { Leer, Seitenkopf } from '../../../../components/bausteine';
import { FormularRahmen } from '../../../../components/formular';
import { StandortFelder } from '../../../../components/stammdaten';
import { holeSitzung } from '../../../../lib/sitzung';
import { hatRolle } from '../../../../lib/token';
import { erstelleStandort } from '../../formulare';

export const metadata: Metadata = { title: 'Standort anlegen' };

export default async function StandortNeu() {
  const sitzung = await holeSitzung();
  return (
    <>
      <Seitenkopf
        titel="Standort anlegen"
        untertitel="Nur erfundene Adressen, solange der Firmensitz nicht feststeht (D-011, D-015)."
        brotkrume={{ href: '/standorte', text: 'Standorte' }}
      />
      <section className="karte">
        {!hatRolle(sitzung?.rollen ?? [], 'admin') ? (
          <Leer>Standorte pflegen darf nur die Rolle Admin.</Leer>
        ) : (
          <FormularRahmen
            aktion={erstelleStandort}
            sendenText="Standort anlegen"
            abbrechenHref="/standorte"
          >
            <StandortFelder />
          </FormularRahmen>
        )}
      </section>
    </>
  );
}
